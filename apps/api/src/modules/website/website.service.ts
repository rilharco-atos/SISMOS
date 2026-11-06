import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebsiteEstado } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MetricsService, M } from '../observability/metrics.service';
import { SettingsService } from '../settings/settings.service';
import { PublicacaoWebsite, WebsitePublisher, criarPublisher } from './publishers';

export interface ResultadoWebsite {
  ok: boolean;
  estado: WebsiteEstado;
  mensagem: string;
}

/***********************************************************************************************************************
* @class         WebsiteService
* @description   Injectable NestJS service that manages publication of approved seismic bulletins on the
*                IPMA public website. Never throws to the caller — a website failure must not block delivery.
*
* @responsibilities
*                 - Publish or update a bulletin via the configured publisher driver (HTTP, filesystem, noop)
*                 - Remove bulletins that are cancelled, archived or deactivated
*                 - Record every publish/remove in the audit log and metrics
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Publishing is disabled in the test environment to protect the public website.
*                 - The active publisher is resolved at construction from ConfigService environment variables.
*
*               Notes for future enhancements:
*                 - Add a retry policy for transient HTTP failures.
***********************************************************************************************************************/
@Injectable()
export class WebsiteService {
  private readonly logger = new Logger(WebsiteService.name);
  private readonly publisher: WebsitePublisher;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private metrics: MetricsService,
    private settings: SettingsService,
    config: ConfigService,
  ) {
    this.publisher = criarPublisher(k => config.get<string>(k));
  }

  /*********************************************************************************************************************
  * @method       integracao
  * @description  Read-only property that exposes the publisher type, configuration state and activation
  *               status for health checks and the backoffice configuration page.
  * @return       Object with tipo, configurado and ativa fields
  *********************************************************************************************************************/
  get integracao() {
    return { tipo: this.publisher.nome, configurado: this.publisher.configurado, ativa: this.ativa() };
  }

  /*********************************************************************************************************************
  * @method       ativa
  * @description  Returns whether website publication is currently active. Always disabled in the test
  *               environment even when the publisher is fully configured.
  * @return       true when the publisher is configured and the current environment is not test
  *********************************************************************************************************************/
  private ativa(): boolean {
    return this.publisher.configurado && this.settings.ambiente() !== 'test';
  }

  /*********************************************************************************************************************
  * @method       publicar
  * @description  Publishes or updates the indicated bulletin version on the public IPMA website.
  *               Inactive, cancelled or archived bulletins are removed instead of published.
  * @param        comunicadoId — bulletin identifier
  * @param        userId — acting user identifier for the audit trail
  * @param        versaoNumero — specific version to publish; defaults to the most recent version
  * @return       ResultadoWebsite with ok flag, websiteEstado and mensagem
  * @process      1. Load bulletin with latest version; return error if not found
  *               2. Redirect to remover() if the bulletin is inactive, cancelled or archived
  *               3. Return early if publishing is disabled (test environment or not configured)
  *               4. Build publication payload and call publisher.publicar()
  *               5. Update websiteEstado in the database and register in the audit log
  *********************************************************************************************************************/
  async publicar(comunicadoId: string, userId: string, versaoNumero?: number): Promise<ResultadoWebsite> {
    const c = await this.prisma.comunicado.findUnique({ where: { id: comunicadoId }, include: { versoes: { orderBy: { numero: 'desc' }, take: 1 } } });
    if (!c) return { ok: false, estado: WebsiteEstado.ERRO, mensagem: 'Comunicado não encontrado' };
    if (!c.ativo || c.estado === 'CANCELADO' || c.estado === 'ARQUIVADO') return this.remover(comunicadoId, userId);
    if (!this.ativa()) return { ok: false, estado: c.websiteEstado, mensagem: this.motivoInativa() };

    const versao = versaoNumero ?? c.versoes[0]?.numero ?? 1;
    const n = (v: unknown) => (v == null ? null : Number(v));
    const p: PublicacaoWebsite = {
      referencia: c.referencia, versao, titulo: c.titulo, texto: c.texto, primeiraPagina: c.primeiraPagina, ativo: c.ativo,
      area: c.areaName, visivelDe: c.websiteInicio?.toISOString() ?? null, visivelAte: c.websiteFim?.toISOString() ?? null,
      evento: {
        dataHoraUtc: c.eventDateTime?.toISOString() ?? null, local: c.local, magnitude: n(c.magnitude),
        latitude: n(c.lat), longitude: n(c.lon), profundidadeKm: n(c.depth), intensidadeMaxima: c.intmax,
      },
      publicadoEm: new Date().toISOString(),
    };

    try {
      await this.publisher.publicar(p);
      await this.prisma.comunicado.update({ where: { id: c.id }, data: { websiteEstado: WebsiteEstado.PUBLICADO, websiteVersao: versao, websitePublicadoEm: new Date(), websiteErro: null } });
      return await this.registar('PUBLICAR_WEBSITE', c.id, userId, true, WebsiteEstado.PUBLICADO, `Publicado (v${String(versao).padStart(3, '0')})`);
    } catch (e: any) {
      await this.prisma.comunicado.update({ where: { id: c.id }, data: { websiteEstado: WebsiteEstado.ERRO, websiteErro: String(e.message).slice(0, 500) } });
      return this.registar('PUBLICAR_WEBSITE', c.id, userId, false, WebsiteEstado.ERRO, e.message);
    }
  }

  /*********************************************************************************************************************
  * @method       remover
  * @description  Removes the bulletin from the public IPMA website. Safe to call on bulletins that were
  *               never published; returns ok immediately in that case.
  * @param        comunicadoId — bulletin identifier
  * @param        userId — acting user identifier for the audit trail
  * @return       ResultadoWebsite with ok flag, websiteEstado and mensagem
  *********************************************************************************************************************/
  async remover(comunicadoId: string, userId: string): Promise<ResultadoWebsite> {
    const c = await this.prisma.comunicado.findUnique({ where: { id: comunicadoId } });
    if (!c) return { ok: false, estado: WebsiteEstado.ERRO, mensagem: 'Comunicado não encontrado' };
    if (c.websiteEstado !== WebsiteEstado.PUBLICADO && c.websiteEstado !== WebsiteEstado.ERRO) {
      return { ok: true, estado: c.websiteEstado, mensagem: 'Não estava publicado' };
    }
    if (!this.ativa()) return { ok: false, estado: c.websiteEstado, mensagem: this.motivoInativa() };
    try {
      await this.publisher.remover(c.referencia);
      await this.prisma.comunicado.update({ where: { id: c.id }, data: { websiteEstado: WebsiteEstado.REMOVIDO, websiteErro: null } });
      return await this.registar('REMOVER_WEBSITE', c.id, userId, true, WebsiteEstado.REMOVIDO, 'Removido do website');
    } catch (e: any) {
      await this.prisma.comunicado.update({ where: { id: c.id }, data: { websiteEstado: WebsiteEstado.ERRO, websiteErro: String(e.message).slice(0, 500) } });
      return this.registar('REMOVER_WEBSITE', c.id, userId, false, WebsiteEstado.ERRO, e.message);
    }
  }

  /*********************************************************************************************************************
  * @method       motivoInativa
  * @description  Returns a human-readable Portuguese message explaining why website publication is
  *               currently disabled: either the test environment or missing WEBSITE_PUBLISHER config.
  * @return       Portuguese string describing why publication is not active
  *********************************************************************************************************************/
  private motivoInativa(): string {
    if (this.settings.ambiente() === 'test') return 'Ambiente de testes: publicação no website desativada';
    return 'Integração com o website não configurada (WEBSITE_PUBLISHER)';
  }

  /*********************************************************************************************************************
  * @method       registar
  * @description  Records the result of a publish or remove operation in metrics, the audit log and the
  *               logger, then returns the ResultadoWebsite for the caller.
  * @param        acao — audit action name (PUBLICAR_WEBSITE or REMOVER_WEBSITE)
  * @param        comunicadoId — bulletin identifier
  * @param        userId — acting user identifier
  * @param        ok — whether the operation succeeded
  * @param        estado — WebsiteEstado to report
  * @param        mensagem — human-readable result message
  * @return       ResultadoWebsite with the provided ok, estado and mensagem
  *********************************************************************************************************************/
  private async registar(acao: string, comunicadoId: string, userId: string, ok: boolean, estado: WebsiteEstado, mensagem: string): Promise<ResultadoWebsite> {
    this.metrics.inc(M.WEBSITE, { operacao: acao === 'PUBLICAR_WEBSITE' ? 'publicar' : 'remover', resultado: ok ? 'ok' : 'falha' });
    if (ok) this.metrics.sucesso('website'); else this.metrics.erro('website', mensagem);
    await this.audit.log({ userId, acao, entidade: 'Comunicado', entidadeId: comunicadoId, comunicadoId, detalhes: { ok, mensagem, integracao: this.publisher.nome } });
    const log = JSON.stringify({ msg: 'Website', acao, comunicadoId, ok, mensagem });
    if (ok) this.logger.log(log); else this.logger.error(log);
    return { ok, estado, mensagem };
  }
}
