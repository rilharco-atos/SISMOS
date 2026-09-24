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

/**
 * Publicação dos comunicados no website público do IPMA.
 * Nunca lança exceções para o chamador: uma falha do website não pode impedir o envio (degradação graciosa).
 */
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

  get integracao() {
    return { tipo: this.publisher.nome, configurado: this.publisher.configurado, ativa: this.ativa() };
  }

  /** No ambiente de teste nunca se publica no website público. */
  private ativa(): boolean {
    return this.publisher.configurado && this.settings.ambiente() !== 'test';
  }

  /** Publica (ou atualiza) a versão indicada. Comunicados inativos são removidos em vez de publicados. */
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

  /** Retira o comunicado do website (cancelado, arquivado ou inativo). */
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

  private motivoInativa(): string {
    if (this.settings.ambiente() === 'test') return 'Ambiente de testes: publicação no website desativada';
    return 'Integração com o website não configurada (WEBSITE_PUBLISHER)';
  }

  private async registar(acao: string, comunicadoId: string, userId: string, ok: boolean, estado: WebsiteEstado, mensagem: string): Promise<ResultadoWebsite> {
    this.metrics.inc(M.WEBSITE, { operacao: acao === 'PUBLICAR_WEBSITE' ? 'publicar' : 'remover', resultado: ok ? 'ok' : 'falha' });
    if (ok) this.metrics.sucesso('website'); else this.metrics.erro('website', mensagem);
    await this.audit.log({ userId, acao, entidade: 'Comunicado', entidadeId: comunicadoId, comunicadoId, detalhes: { ok, mensagem, integracao: this.publisher.nome } });
    const log = JSON.stringify({ msg: 'Website', acao, comunicadoId, ok, mensagem });
    if (ok) this.logger.log(log); else this.logger.error(log);
    return { ok, estado, mensagem };
  }
}
