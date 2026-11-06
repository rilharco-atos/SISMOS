import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ComunicadoEstado, ComunicadoOrigem, ListaKey, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { XmlParserService, XmlEventData } from './xml-parser.service';
import { PdfService } from './pdf.service';
import { ReferenciaService } from './referencia.service';
import { CreateComunicadoDto, NovaVersaoDto } from './dto/create-comunicado.dto';
import { UpdateComunicadoDto } from './dto/update-comunicado.dto';
import { TEMPLATES, isTemplateId, preencherTemplate, TemplateData } from './templates';
import { DocumentoComunicado } from './documento';
import { WebsiteService } from '../website/website.service';
import { MetricsService, M } from '../observability/metrics.service';

export const SYSTEM_USER_ID = 'system';
const JANELA_MESMO_EVENTO_MS = 5 * 60 * 1000;
const DISTANCIA_MESMO_EVENTO_GRAUS = 0.5;

const INCLUDE_LISTA = {
  criadoPor: { select: { name: true, email: true } },
  versoes: {
    orderBy: { numero: 'asc' as const },
    include: { emailEnvios: { orderBy: { enviadoEm: 'asc' as const } }, smsEnvios: { orderBy: { enviadoEm: 'asc' as const } } },
  },
};

/***********************************************************************************************************************
* @class         ComunicadosService
* @description   Core NestJS service that manages the full lifecycle of seismic bulletins. Handles
*                creation from both manual form submissions and automated XML FTP ingestion, version
*                management, state transitions, and website publication.
*
* @responsibilities
*                 - Create bulletins (manual and automated XML flows) with atomic sequential references
*                 - Generate PDF documents for each version via PdfService
*                 - Manage state transitions (approve, cancel, archive) and their side-effects
*                 - Coordinate website publication and removal via WebsiteService
*                 - Provide filtered bulletin listings and KPI aggregations for the dashboard
*                 - Detect duplicate bulletins from the same seismic event within a 5-minute / 0.5° window
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Reference assignment runs inside a Prisma transaction via ReferenciaService.
*                 - PDF generation runs outside the transaction to avoid blocking the DB connection.
*                 - SYSTEM_USER_ID is used for automated flows (polling) with no human actor.
*                 - KPIs are calculated in Lisbon time for month boundaries but UTC for the last-24h counter.
***********************************************************************************************************************/
@Injectable()
export class ComunicadosService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private xmlParser: XmlParserService,
    private pdf: PdfService,
    private referencias: ReferenciaService,
    private website: WebsiteService,
    private metrics: MetricsService,
  ) {}

  /*********************************************************************************************************************
  * @method       publicarWebsite
  * @description  Publishes the bulletin's current version to the configured website integration.
  *               Delegates entirely to WebsiteService.publicar.
  * @param        id — bulletin UUID
  * @param        userId — authenticated user id for audit logging
  * @uses         WebsiteService.publicar
  *********************************************************************************************************************/
  publicarWebsite(id: string, userId: string) { return this.website.publicar(id, userId); }

  /*********************************************************************************************************************
  * @method       removerWebsite
  * @description  Removes the bulletin from the configured website integration.
  *               Delegates entirely to WebsiteService.remover.
  * @param        id — bulletin UUID
  * @param        userId — authenticated user id for audit logging
  * @uses         WebsiteService.remover
  *********************************************************************************************************************/
  removerWebsite(id: string, userId: string) { return this.website.remover(id, userId); }

  /*********************************************************************************************************************
  * @method       estadoIntegracaoWebsite
  * @description  Returns the current website integration state object (provider, URL, last error).
  * @return       WebsiteService integration state
  * @uses         WebsiteService.integracao
  *********************************************************************************************************************/
  estadoIntegracaoWebsite() { return this.website.integracao; }

  /*********************************************************************************************************************
  * @method       findAll
  * @description  Returns all bulletins with optional filters. The mes filter accepts YYYY-MM and
  *               matches against the bulletin's criadoEm timestamp in UTC.
  * @param        filters — optional object with estado, areaName, search and mes
  * @return       Array of bulletin records with versoes and envios included
  * @uses         PrismaService.comunicado.findMany
  *********************************************************************************************************************/
  async findAll(filters?: { estado?: string; areaName?: string; search?: string; mes?: string }) {
    const where: Prisma.ComunicadoWhereInput = {};
    if (filters?.estado && filters.estado in ComunicadoEstado) where.estado = filters.estado as ComunicadoEstado;
    if (filters?.areaName) where.areaName = filters.areaName;
    if (filters?.search) where.OR = [
      { titulo: { contains: filters.search, mode: 'insensitive' } },
      { referencia: { contains: filters.search, mode: 'insensitive' } },
      { local: { contains: filters.search, mode: 'insensitive' } },
    ];
    const mes = filters?.mes?.match(/^(\d{4})-(\d{2})$/);
    if (mes) {
      const ano = Number(mes[1]), m = Number(mes[2]) - 1;
      where.criadoEm = { gte: new Date(Date.UTC(ano, m, 1)), lt: new Date(Date.UTC(ano, m + 1, 1)) };
    }
    return this.prisma.comunicado.findMany({ where, include: INCLUDE_LISTA, orderBy: { criadoEm: 'desc' } });
  }

  /*********************************************************************************************************************
  * @method       findOne
  * @description  Returns a single bulletin by UUID. Throws NotFoundException when not found.
  * @param        id — bulletin UUID
  * @return       Full bulletin record with versoes, emailEnvios and smsEnvios
  * @uses         PrismaService.comunicado.findUnique
  *********************************************************************************************************************/
  async findOne(id: string) {
    const c = await this.prisma.comunicado.findUnique({ where: { id }, include: INCLUDE_LISTA });
    if (!c) throw new NotFoundException('Comunicado não encontrado');
    return c;
  }

  /*********************************************************************************************************************
  * @method       listarTemplates
  * @description  Returns the full catalogue of available bulletin templates with id, label and base text.
  * @return       Array of { id, label, texto } objects from the TEMPLATES constant
  *********************************************************************************************************************/
  listarTemplates() {
    return Object.entries(TEMPLATES).map(([id, t]) => ({ id, label: t.label, texto: t.texto }));
  }

  /*********************************************************************************************************************
  * @method       preencher
  * @description  Fills a bulletin template with the provided event data and returns the resulting texto.
  *               Does not persist anything; used for the form pre-fill preview.
  * @param        templateId — template identifier to look up in TEMPLATES
  * @param        data — TemplateData with event fields for placeholder substitution
  * @return       Object with templateId and the filled texto string
  * @uses         preencherTemplate
  *********************************************************************************************************************/
  preencher(templateId: string, data: TemplateData) {
    if (!isTemplateId(templateId)) throw new BadRequestException('Template desconhecido');
    return { templateId, texto: preencherTemplate(templateId, { ...data, eventDateTime: data.eventDateTime ? new Date(data.eventDateTime) : null }) };
  }

  /*********************************************************************************************************************
  * @method       analisarXml
  * @description  Parses an IPMA seismic XML string, fills the matching template, and checks whether
  *               an existing bulletin for the same event already exists in the DB.
  * @param        xml — raw UTF-8 XML string from the uploaded file
  * @return       Object with dados (form fields), origem (audit info), titulo, texto and correspondente
  * @uses         XmlParserService.parse, preencherTemplate, ComunicadosService.encontrarMesmoEvento
  *********************************************************************************************************************/
  async analisarXml(xml: string) {
    const data = this.xmlParser.parse(xml);
    const correspondente = await this.encontrarMesmoEvento(data);
    return {
      dados: {
        templateId: data.templateId,
        primeiraPagina: data.firstPage,
        ativo: data.active,
        local: data.local,
        areaName: data.areaName,
        eventDateTime: data.eventDateTime.toISOString(),
        lat: data.lat, lon: data.lon, depth: data.depth, magnitude: data.magnitude,
        intmax: data.intmax, regiaoIntmax: data.regiaoIntmax, infoMacrossAdicional: data.infoMacrossAdicional,
        klmLink: data.klmLink,
        smsListas: data.smsKeys, emailListas: data.emailKeys,
      },
      origem: { criadoPor: data.creatingUser, entidade: data.creatingAuthority, criadoEm: data.creationTime, temInfoMacrossismica: data.temInfoMacrossismica },
      titulo: this.tituloSugerido(data),
      texto: preencherTemplate(data.templateId, data),
      correspondente: correspondente && {
        id: correspondente.id,
        referencia: correspondente.referencia,
        titulo: correspondente.titulo,
        estado: correspondente.estado,
        versoes: correspondente._count.versoes,
      },
    };
  }

  /*********************************************************************************************************************
  * @method       create
  * @description  Creates a new seismic bulletin (versão 001) with an atomically assigned annual reference.
  *               Runs the reference assignment inside a Prisma transaction, then generates the PDF outside it.
  * @param        dto — CreateComunicadoDto with all bulletin fields
  * @param        userId — authenticated user id for audit and versao record
  * @param        origem — MANUAL (default) or AUTOMATICO for the FTP polling flow
  * @return       Full bulletin record with the first versao record
  * @uses         ReferenciaService.proxima, PdfService.generate, AuditService.log, MetricsService.inc
  *********************************************************************************************************************/
  async create(dto: CreateComunicadoDto, userId: string, origem: ComunicadoOrigem = ComunicadoOrigem.MANUAL): Promise<any> {
    const xml = dto.xmlFonte ? this.xmlParser.parse(dto.xmlFonte) : null;
    const websiteInicio = dto.websiteInicio ? new Date(dto.websiteInicio) : new Date();
    const websiteFim = dto.websiteFim ? new Date(dto.websiteFim) : new Date(websiteInicio.getTime() + 24 * 60 * 60 * 1000);
    const eventDateTime = dto.eventDateTime ? new Date(dto.eventDateTime) : xml?.eventDateTime;

    const comunicado = await this.prisma.$transaction(async tx => {
      const ref = await this.referencias.proxima(tx);
      return tx.comunicado.create({
        data: {
          referencia: ref.referencia,
          ano: ref.ano,
          numeroAno: ref.numeroAno,
          origem,
          templateId: dto.templateId,
          primeiraPagina: dto.primeiraPagina ?? false,
          ativo: dto.ativo ?? true,
          titulo: dto.titulo,
          texto: dto.texto,
          estado: ComunicadoEstado.RASCUNHO,
          local: dto.local,
          areaName: dto.areaName ?? 'Continente',
          eventDateTime,
          lat: dto.lat, lon: dto.lon, depth: dto.depth, magnitude: dto.magnitude,
          intmax: dto.intmax, regiaoIntmax: dto.regiaoIntmax, infoMacrossAdicional: dto.infoMacrossAdicional,
          klmLink: xml?.klmLink || dto.klmLink,
          smsListas: (dto.smsListas ?? xml?.smsKeys ?? []) as ListaKey[],
          emailListas: (dto.emailListas ?? xml?.emailKeys ?? []) as ListaKey[],
          xmlCriadoPor: xml?.creatingUser || null,
          imagemUrl: dto.imagemUrl,
          websiteInicio, websiteFim,
          xmlFonte: dto.xmlFonte,
          criadoPorId: userId,
        },
      });
    });

    const pdfPath = await this.pdf.generate(await this.documento(comunicado, 1, userId));
    await this.prisma.versao.create({
      data: { comunicadoId: comunicado.id, numero: 1, titulo: dto.titulo, texto: dto.texto, imagemUrl: dto.imagemUrl, pdfPath, xmlFonte: dto.xmlFonte, criadoPorId: userId },
    });

    this.metrics.inc(M.COMUNICADOS_CRIADOS, { origem: origem.toLowerCase() });
    await this.audit.log({
      userId, acao: xml ? 'CRIAR_XML' : 'CRIAR', entidade: 'Comunicado', entidadeId: comunicado.id, comunicadoId: comunicado.id,
      detalhes: { referencia: comunicado.referencia, templateId: dto.templateId, origem, xmlCriadoPor: xml?.creatingUser },
    });
    return this.findOne(comunicado.id);
  }

  /*********************************************************************************************************************
  * @method       createFromXml
  * @description  Automated FTP polling flow: parses the XML, builds a CreateComunicadoDto and delegates
  *               to create() with origem AUTOMATICO.
  * @param        xml — raw UTF-8 XML string deposited on the FTP server by the Operations Centre
  * @param        userId — SYSTEM_USER_ID for automated runs, or the analyst's id for manual XML import
  * @return       Full bulletin record with the first versao record
  * @uses         XmlParserService.parse, ComunicadosService.create, preencherTemplate
  *********************************************************************************************************************/
  async createFromXml(xml: string, userId: string): Promise<any> {
    const data = this.xmlParser.parse(xml);
    const dto: CreateComunicadoDto = {
      templateId: data.templateId,
      primeiraPagina: data.firstPage,
      ativo: data.active,
      titulo: this.tituloSugerido(data),
      texto: preencherTemplate(data.templateId, data),
      local: data.local,
      areaName: data.areaName,
      eventDateTime: data.eventDateTime.toISOString(),
      lat: data.lat, lon: data.lon, depth: data.depth, magnitude: data.magnitude,
      intmax: data.intmax, regiaoIntmax: data.regiaoIntmax, infoMacrossAdicional: data.infoMacrossAdicional,
      smsListas: data.smsKeys, emailListas: data.emailKeys,
      xmlFonte: xml,
    };
    return this.create(dto, userId, ComunicadoOrigem.AUTOMATICO);
  }

  /*********************************************************************************************************************
  * @method       update
  * @description  Updates bulletin metadata fields without creating a new version record.
  *               If ativo is set to false, removes the bulletin from the website.
  * @param        id — bulletin UUID
  * @param        dto — UpdateComunicadoDto with the fields to update
  * @param        userId — authenticated user id for audit logging
  * @return       Full updated bulletin record
  * @uses         PrismaService.comunicado.update, AuditService.log, WebsiteService.remover
  *********************************************************************************************************************/
  async update(id: string, dto: UpdateComunicadoDto, userId: string): Promise<any> {
    await this.findOne(id);
    const { websiteInicio, websiteFim, ...resto } = dto;
    await this.prisma.comunicado.update({
      where: { id },
      data: {
        ...resto,
        smsListas: dto.smsListas as ListaKey[] | undefined,
        emailListas: dto.emailListas as ListaKey[] | undefined,
        websiteInicio: websiteInicio ? new Date(websiteInicio) : undefined,
        websiteFim: websiteFim ? new Date(websiteFim) : undefined,
      },
    });
    await this.audit.log({ userId, acao: 'EDITAR', entidade: 'Comunicado', entidadeId: id, comunicadoId: id, detalhes: dto as any });
    if (dto.ativo === false) await this.website.remover(id, userId);
    return this.findOne(id);
  }

  /*********************************************************************************************************************
  * @method       criarNovaVersao
  * @description  Creates a new numbered version (002, 003, …) of an existing bulletin, preserving the
  *               same reference. Updates the bulletin's seismic fields from dto when provided.
  *               Resets the bulletin state to RASCUNHO if it was ENVIADO.
  * @param        id — bulletin UUID
  * @param        dto — NovaVersaoDto with mandatory titulo/texto and optional updated fields
  * @param        userId — authenticated user id for audit and versao record
  * @return       The newly created Versao record
  * @uses         PdfService.generate, ComunicadosService.documento, AuditService.log
  *********************************************************************************************************************/
  async criarNovaVersao(id: string, dto: NovaVersaoDto, userId: string) {
    const atual = await this.findOne(id);
    if (dto.xmlFonte) this.xmlParser.parse(dto.xmlFonte);
    const novoNumero = Math.max(0, ...atual.versoes.map(v => v.numero)) + 1;

    const comunicado = await this.prisma.comunicado.update({
      where: { id },
      data: {
        titulo: dto.titulo,
        texto: dto.texto,
        imagemUrl: dto.imagemUrl ?? atual.imagemUrl,
        templateId: dto.templateId ?? atual.templateId,
        local: dto.local ?? undefined,
        magnitude: dto.magnitude ?? undefined,
        depth: dto.depth ?? undefined,
        lat: dto.lat ?? undefined,
        lon: dto.lon ?? undefined,
        intmax: dto.intmax ?? undefined,
        regiaoIntmax: dto.regiaoIntmax ?? undefined,
        infoMacrossAdicional: dto.infoMacrossAdicional ?? undefined,
        primeiraPagina: dto.primeiraPagina ?? undefined,
        ativo: dto.ativo ?? undefined,
        smsListas: dto.smsListas as ListaKey[] | undefined,
        emailListas: dto.emailListas as ListaKey[] | undefined,
        estado: atual.estado === ComunicadoEstado.ENVIADO ? ComunicadoEstado.RASCUNHO : undefined,
      },
    });

    const pdfPath = await this.pdf.generate(await this.documento(comunicado, novoNumero, userId));
    const versao = await this.prisma.versao.create({
      data: { comunicadoId: id, numero: novoNumero, titulo: dto.titulo, texto: dto.texto, imagemUrl: comunicado.imagemUrl, pdfPath, xmlFonte: dto.xmlFonte, criadoPorId: userId },
    });
    await this.audit.log({ userId, acao: 'NOVA_VERSAO', entidade: 'Versao', entidadeId: versao.id, comunicadoId: id, detalhes: { numero: novoNumero, comXml: !!dto.xmlFonte } });
    return versao;
  }

  /*********************************************************************************************************************
  * @method       aprovar
  * @description  Transitions the bulletin state to APROVADO.
  * @param        id — bulletin UUID
  * @param        userId — authenticated user id for audit logging
  * @uses         ComunicadosService.mudarEstado
  *********************************************************************************************************************/
  async aprovar(id: string, userId: string) { return this.mudarEstado(id, userId, ComunicadoEstado.APROVADO, 'APROVAR'); }

  /*********************************************************************************************************************
  * @method       cancelar
  * @description  Transitions the bulletin state to CANCELADO and removes it from the website.
  * @param        id — bulletin UUID
  * @param        userId — authenticated user id for audit logging
  * @uses         ComunicadosService.mudarEstado, WebsiteService.remover
  *********************************************************************************************************************/
  async cancelar(id: string, userId: string) {
    await this.mudarEstado(id, userId, ComunicadoEstado.CANCELADO, 'CANCELAR');
    await this.website.remover(id, userId);
    return this.findOne(id);
  }

  /*********************************************************************************************************************
  * @method       arquivar
  * @description  Transitions the bulletin state to ARQUIVADO and removes it from the website.
  * @param        id — bulletin UUID
  * @param        userId — authenticated user id for audit logging
  * @uses         ComunicadosService.mudarEstado, WebsiteService.remover
  *********************************************************************************************************************/
  async arquivar(id: string, userId: string) {
    await this.mudarEstado(id, userId, ComunicadoEstado.ARQUIVADO, 'ARQUIVAR');
    await this.website.remover(id, userId);
    return this.findOne(id);
  }

  /*********************************************************************************************************************
  * @method       remove
  * @description  Permanently deletes a bulletin and all its cascaded records. Logs the deletion in the
  *               audit trail before removing the DB record.
  * @param        id — bulletin UUID
  * @param        userId — authenticated user id for audit logging
  * @return       Object with deleted: true
  * @uses         AuditService.log, PrismaService.comunicado.delete
  *********************************************************************************************************************/
  async remove(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.comunicado.delete({ where: { id } });
    await this.audit.log({ userId, acao: 'ELIMINAR', entidade: 'Comunicado', entidadeId: id });
    return { deleted: true };
  }

  /*********************************************************************************************************************
  * @method       getKpis
  * @description  Computes dashboard KPI aggregations: total bulletins, current and previous month counts,
  *               pending bulletins, automated bulletins in the last 24h, email and SMS delivery rates,
  *               and the highest-magnitude event of the current month.
  * @return       KPI object with total, mesAtual, mesAnterior, pendentes, automaticos24h,
  *               taxaEmail, totalEmail, taxaSms, totalSms and magMax
  * @uses         PrismaService.comunicado.count, PrismaService.emailEnvio.aggregate
  *********************************************************************************************************************/
  async getKpis() {
    const agora = new Date();
    const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
    const inicioMesAnterior = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1));
    const ha24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);

    const [total, mesAtual, mesAnterior, pendentes, automaticos24h, email, sms, magMax] = await Promise.all([
      this.prisma.comunicado.count(),
      this.prisma.comunicado.count({ where: { criadoEm: { gte: inicioMes } } }),
      this.prisma.comunicado.count({ where: { criadoEm: { gte: inicioMesAnterior, lt: inicioMes } } }),
      this.prisma.comunicado.count({ where: { estado: { in: [ComunicadoEstado.RASCUNHO, ComunicadoEstado.PENDENTE] } } }),
      this.prisma.comunicado.count({ where: { origem: ComunicadoOrigem.AUTOMATICO, criadoEm: { gte: ha24h } } }),
      this.prisma.emailEnvio.aggregate({ where: { enviadoEm: { gte: inicioMes } }, _sum: { totalEnviado: true, totalFalha: true } }),
      this.prisma.smsEnvio.aggregate({ where: { enviadoEm: { gte: inicioMes } }, _sum: { totalEnviado: true, totalFalha: true } }),
      this.prisma.comunicado.findFirst({
        where: { eventDateTime: { gte: inicioMes }, magnitude: { not: null } },
        orderBy: { magnitude: 'desc' },
        select: { magnitude: true, areaName: true, eventDateTime: true, referencia: true },
      }),
    ]);

    const taxa = (s: { totalEnviado: number | null; totalFalha: number | null }) => {
      const t = (s.totalEnviado ?? 0) + (s.totalFalha ?? 0);
      return t ? (s.totalEnviado ?? 0) / t : null;
    };
    return {
      total, mesAtual, mesAnterior, pendentes, automaticos24h,
      taxaEmail: taxa(email._sum), totalEmail: (email._sum.totalEnviado ?? 0) + (email._sum.totalFalha ?? 0),
      taxaSms: taxa(sms._sum), totalSms: (sms._sum.totalEnviado ?? 0) + (sms._sum.totalFalha ?? 0),
      magMax,
    };
  }

  /*********************************************************************************************************************
  * @method       documento
  * @description  Builds the DocumentoComunicado value object used by PdfService and DeliveryService.
  *               Looks up the technician's name from the users table when userId is a real user (not system).
  * @param        c — bulletin Prisma record (any, to accept both full and partial selects)
  * @param        versao — version number for the document header
  * @param        userId — optional user id to resolve the technician name
  * @param        dataEmissao — emission timestamp (default: now)
  * @return       DocumentoComunicado value object ready for PDF/email generation
  * @uses         PrismaService.user.findUnique
  *********************************************************************************************************************/
  async documento(c: any, versao: number, userId?: string, dataEmissao = new Date()): Promise<DocumentoComunicado> {
    const tecnico = userId && userId !== SYSTEM_USER_ID
      ? (await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name
      : null;
    const n = (v: any) => (v == null ? null : Number(v));
    return {
      referencia: c.referencia, versao, titulo: c.titulo, texto: c.texto, templateId: c.templateId,
      areaName: c.areaName, eventDateTime: c.eventDateTime, magnitude: n(c.magnitude), lat: n(c.lat), lon: n(c.lon),
      depth: n(c.depth), intmax: c.intmax, regiaoIntmax: c.regiaoIntmax, local: c.local, imagemUrl: c.imagemUrl,
      tecnico, dataEmissao,
    };
  }

  /*********************************************************************************************************************
  * @method       mudarEstado
  * @description  Generic state transition helper: finds the bulletin, updates its estado field and
  *               appends an audit log entry.
  * @param        id — bulletin UUID
  * @param        userId — authenticated user id for audit logging
  * @param        estado — target ComunicadoEstado enum value
  * @param        acao — audit action string (APROVAR, CANCELAR, ARQUIVAR)
  * @return       Full updated bulletin record
  * @uses         PrismaService.comunicado.update, AuditService.log
  *********************************************************************************************************************/
  private async mudarEstado(id: string, userId: string, estado: ComunicadoEstado, acao: string) {
    await this.findOne(id);
    await this.prisma.comunicado.update({ where: { id }, data: { estado } });
    await this.audit.log({ userId, acao, entidade: 'Comunicado', entidadeId: id, comunicadoId: id });
    return this.findOne(id);
  }

  /*********************************************************************************************************************
  * @method       tituloSugerido
  * @description  Builds the auto-generated bulletin title from the parsed XML event data.
  * @param        d — XmlEventData with magnitude and local/areaName fields
  * @return       Formatted title string (e.g. "Sismo de magnitude 3.5 — Lisboa")
  *********************************************************************************************************************/
  private tituloSugerido(d: XmlEventData): string {
    const mag = Number.isFinite(d.magnitude) ? ` de magnitude ${d.magnitude.toFixed(1)}` : '';
    return `Sismo${mag} — ${d.local || d.areaName}`;
  }

  /*********************************************************************************************************************
  * @method       encontrarMesmoEvento
  * @description  Queries the DB for an existing bulletin within 5 minutes and 0.5° of the parsed event.
  *               Used during XML analysis to warn the analyst about potential duplicate bulletins.
  * @param        d — XmlEventData with eventDateTime, lat and lon
  * @return       The most recently created matching bulletin, or null when none found
  * @uses         PrismaService.comunicado.findMany
  *********************************************************************************************************************/
  private async encontrarMesmoEvento(d: XmlEventData) {
    const t = d.eventDateTime.getTime();
    const candidatos = await this.prisma.comunicado.findMany({
      where: {
        eventDateTime: { gte: new Date(t - JANELA_MESMO_EVENTO_MS), lte: new Date(t + JANELA_MESMO_EVENTO_MS) },
        estado: { notIn: [ComunicadoEstado.CANCELADO, ComunicadoEstado.ARQUIVADO] },
      },
      select: { id: true, referencia: true, titulo: true, estado: true, lat: true, lon: true, _count: { select: { versoes: true } } },
      orderBy: { criadoEm: 'desc' },
    });
    return candidatos.find(c =>
      c.lat == null || c.lon == null ||
      (Math.abs(Number(c.lat) - d.lat) <= DISTANCIA_MESMO_EVENTO_GRAUS && Math.abs(Number(c.lon) - d.lon) <= DISTANCIA_MESMO_EVENTO_GRAUS),
    ) ?? null;
  }
}
