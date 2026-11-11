import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as nodemailer from 'nodemailer';
import * as ftp from 'basic-ftp';
import SftpClient = require('ssh2-sftp-client');
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { MetricsService } from '../observability/metrics.service';
import { WebsiteService } from '../website/website.service';
import { mascarar } from '../listas/listas.service';
import { Mascara, TABELAS_DADOS, TabelaDados, construirSelect, valorPorCaminho } from './dados.registry';
import { UpdateConfigDto } from './dto/update-config.dto';
import { avaliarBackup, avaliarEnvio, avaliarFtp, avaliarWebsite, estadoGlobal } from './saude';

const SEGREDOS = ['ftpPassword', 'smtpPassword', 'ingestApiKey'] as const;

/***********************************************************************************************************************
* @class         SystemService
* @description   Injectable NestJS service for system administration, health monitoring and configuration.
*                Provides the backoffice configuration read/write, connectivity tests for FTP and
*                SMTP, health checks, ingest API key generation and audit log access.
*
* @responsibilities
*                 - Retrieve and update the singleton SystemConfig row
*                 - Test live FTP and SMTP/HTTP-email connectivity
*                 - Compute the aggregated health status from all subsystem component states
*                 - Generate and rotate the ingest API key
*                 - Expose the audit log to administrators
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Secret fields (ftpPassword, smtpPassword, ingestApiKey) are never returned in
*                   getConfig(); callers receive a boolean flag (temXxxPassword) instead.
*                 - SEGREDOS constant lists the secret field names; empty strings in UpdateConfigDto
*                   are silently dropped so that blanks from masked UI inputs do not overwrite stored secrets.
*                 - The public /health endpoint returns only status codes, never host names or messages.
***********************************************************************************************************************/
@Injectable()
export class SystemService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
    private metrics: MetricsService,
    private website: WebsiteService,
    private config: ConfigService,
  ) {}

  /*********************************************************************************************************************
  * @method       getConfig
  * @description  Returns the current SystemConfig row for the backoffice UI. Secret fields are
  *               redacted and replaced with boolean presence flags (temFtpPassword etc.).
  *               Also includes the effective origins and runtime environment from SettingsService.
  * @return       Promise resolving to the sanitised config object, or null when no row exists yet
  * @uses         PrismaService.systemConfig.findUnique, SettingsService.ftp, SettingsService.smtp,
  *               SettingsService.sms, SettingsService.ambiente, WebsiteService.integracao
  *********************************************************************************************************************/
  async getConfig() {
    const cfg = await this.prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
    if (!cfg) return null;
    const { ftpPassword, smtpPassword, ingestApiKey, ...resto } = cfg;
    const [ftp, smtp, sms] = await Promise.all([this.settings.ftp(), this.settings.smtp(), this.settings.sms()]);
    return {
      ...resto, ftpPassword: '', smtpPassword: '', ingestApiKey: '',
      temFtpPassword: !!ftpPassword, temSmtpPassword: !!smtpPassword, temIngestApiKey: !!ingestApiKey,
      origemFtp: ftp.origem, origemSmtp: smtp.origem,
      ambiente: this.settings.ambiente(), modoEnvio: sms.modo, modoImpostoPeloAmbiente: sms.impostoPeloAmbiente,
      website: this.website.integracao,
    };
  }

  /*********************************************************************************************************************
  * @method       saudeDetalhada
  * @description  Computes the detailed health state for all system components. Restricted to ADMIN
  *               users in the controller; includes component-level messages, last success/error times
  *               and the global aggregated status.
  * @return       Promise resolving to the full health object with db, ambiente, modoEnvio,
  *               envioSimulado, timestamp and a componentes map
  * @uses         SystemService.dbOk, SettingsService.ftp, SettingsService.sms, MetricsService.estadoPartilhado,
  *               WebsiteService.integracao, avaliarFtp, avaliarEnvio, avaliarWebsite, avaliarBackup, estadoGlobal
  *********************************************************************************************************************/
  async saudeDetalhada() {
    const [db, ftpCfg, sms] = await Promise.all([this.dbOk(), this.settings.ftp(), this.settings.sms()]);
    const integracao = this.website.integracao;
    const ambiente = this.settings.ambiente();
    const [eFtp, eEnvio, eWebsite] = await Promise.all(['ftp', 'envio', 'website'].map(c => this.metrics.estadoPartilhado(c)));
    const componentes = {
      ftp: avaliarFtp(eFtp, !!ftpCfg.host, ftpCfg.pollIntervalMs),
      envio: avaliarEnvio(eEnvio),
      website: avaliarWebsite(eWebsite, integracao.ativa,
        ambiente === 'test' ? 'Desativado no ambiente de testes' : integracao.configurado ? undefined : 'Integração não configurada'),
      backup: avaliarBackup(this.ultimoBackup(), Number(this.config.get('BACKUP_MAX_IDADE_HORAS')) || 26, ambiente === 'production'),
    };
    return {
      status: estadoGlobal(db, Object.values(componentes)),
      db: db ? 'ok' : 'error',
      ambiente, modoEnvio: sms.modo, envioSimulado: sms.simulado,
      timestamp: new Date().toISOString(),
      componentes,
    };
  }

  /*********************************************************************************************************************
  * @method       ultimoBackup
  * @description  Returns the mtime of the most recent .dump file found in the BACKUP_DIR directory.
  *               Returns null when the directory is missing, empty or unreadable.
  * @return       Date of the most recent .dump file, or null
  * @uses         fs.readdirSync, fs.statSync, ConfigService.get
  *********************************************************************************************************************/
  private ultimoBackup(): Date | null {
    const dir = path.resolve(this.config.get<string>('BACKUP_DIR') ?? 'backups');
    try {
      const datas = fs.readdirSync(dir).filter(f => f.endsWith('.dump')).map(f => fs.statSync(path.join(dir, f)).mtime);
      return datas.length ? new Date(Math.max(...datas.map(d => d.getTime()))) : null;
    } catch {
      return null;
    }
  }

  private async dbOk(): Promise<boolean> {
    try { await this.prisma.$queryRaw`SELECT 1`; return true; } catch { return false; }
  }

  /*********************************************************************************************************************
  * @method       testarSmtp
  * @description  Tests the effective email transport configuration without sending any message.
  *               When an HTTP API key is present (Resend or SendGrid), probes the send endpoint
  *               with an empty body and distinguishes auth failure (401/403) from valid key (422).
  *               When using plain SMTP, opens and verifies a nodemailer transport connection.
  * @param        userId — authenticated user id for audit logging
  * @return       Promise resolving to { ok, origem, mensagem, duracaoMs }
  * @uses         SettingsService.smtp, SystemService.resultadoTeste, nodemailer.createTransport
  *********************************************************************************************************************/
  async testarSmtp(userId: string) {
    const smtp = await this.settings.smtp();
    const inicio = Date.now();

    if (smtp.apiProvedor !== 'nenhum') {
      const sendgrid = smtp.apiProvedor === 'sendgrid';
      const nome = sendgrid ? 'SendGrid' : 'Resend';
      const url = sendgrid ? 'https://api.sendgrid.com/v3/mail/send' : 'https://api.resend.com/emails';
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${smtp.apiKey}`, 'Content-Type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(10000),
        });
        if (res.status === 401 || res.status === 403) {
          const corpo: any = await res.json().catch(() => null);
          throw new Error(corpo?.message ?? `chave recusada (${res.status})`);
        }
        return this.resultadoTeste(userId, 'SMTP', true, smtp.origem, `Envio por HTTPS (${nome}) — chave aceite`, inicio);
      } catch (e: any) {
        return this.resultadoTeste(userId, 'SMTP', false, smtp.origem, `Envio por HTTPS (${nome}): ${e.message}`, inicio);
      }
    }

    if (!smtp.host) return { ok: false, origem: smtp.origem, mensagem: 'Servidor SMTP não configurado' };
    try {
      await nodemailer.createTransport({
        host: smtp.host, port: smtp.port, secure: smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined, connectionTimeout: 10000,
      }).verify();
      return this.resultadoTeste(userId, 'SMTP', true, smtp.origem, `Ligação a ${smtp.host}:${smtp.port} aceite`, inicio);
    } catch (e: any) {
      return this.resultadoTeste(userId, 'SMTP', false, smtp.origem, e.message, inicio);
    }
  }

  /*********************************************************************************************************************
  * @method       testarFtp
  * @description  Connects to the FTP server using the effective configuration and counts XML files
  *               in the incoming directory, without processing or downloading them.
  * @param        userId — authenticated user id for audit logging
  * @return       Promise resolving to { ok, origem, mensagem, duracaoMs }
  * @uses         SettingsService.ftp, SystemService.resultadoTeste, basic-ftp.Client
  *********************************************************************************************************************/
  async testarFtp(userId: string) {
    const cfg = await this.settings.ftp();
    if (!cfg.host) return { ok: false, origem: cfg.origem, mensagem: 'Servidor FTP não configurado' };
    const inicio = Date.now();
    const protocolo = cfg.sftp ? 'SFTP' : 'FTP';

    if (cfg.sftp) {
      const sftp = new SftpClient();
      try {
        await sftp.connect({ host: cfg.host, port: cfg.port, username: cfg.user, password: cfg.password });
        const list = await sftp.list(cfg.incomingDir);
        const xmls = list.filter(f => f.name.endsWith('.xml') && f.type === '-').length;
        return this.resultadoTeste(userId, protocolo, true, cfg.origem, `Ligação a ${cfg.host}:${cfg.port} aceite · ${xmls} ficheiro(s) XML em ${cfg.incomingDir}`, inicio);
      } catch (e: any) {
        return this.resultadoTeste(userId, protocolo, false, cfg.origem, e.message, inicio);
      } finally {
        await sftp.end().catch(() => undefined);
      }
    }

    const client = new ftp.Client(10000);
    try {
      await client.access({ host: cfg.host, user: cfg.user, password: cfg.password, secure: false });
      const xmls = (await client.list(cfg.incomingDir)).filter(f => f.name.endsWith('.xml') && f.type === ftp.FileType.File).length;
      return this.resultadoTeste(userId, protocolo, true, cfg.origem, `Ligação a ${cfg.host} aceite · ${xmls} ficheiro(s) XML em ${cfg.incomingDir}`, inicio);
    } catch (e: any) {
      return this.resultadoTeste(userId, protocolo, false, cfg.origem, e.message, inicio);
    } finally {
      client.close();
    }
  }

  private async resultadoTeste(userId: string, servico: string, ok: boolean, origem: string, mensagem: string, inicio: number) {
    const duracaoMs = Date.now() - inicio;
    await this.audit.log({ userId, acao: 'TESTAR_LIGACAO', entidade: 'SystemConfig', entidadeId: servico, detalhes: { ok, origem, duracaoMs, mensagem } });
    return { ok, origem, mensagem, duracaoMs };
  }

  /*********************************************************************************************************************
  * @method       updateConfig
  * @description  Upserts the singleton SystemConfig row. Secret fields whose incoming value is
  *               empty are silently dropped so that masked UI placeholders do not wipe stored secrets.
  *               Rejects a request to set smsMode='production' in a 'test' environment.
  * @param        dto — UpdateConfigDto with the fields to update
  * @param        userId — authenticated user id for audit logging
  * @return       Promise resolving to the updated config from getConfig()
  * @uses         PrismaService.systemConfig.upsert, AuditService.log, SettingsService.ambiente
  *********************************************************************************************************************/
  async updateConfig(dto: UpdateConfigDto, userId: string) {
    if (dto.smsMode === 'production' && this.settings.ambiente() === 'test') {
      throw new BadRequestException('No ambiente de testes o modo de envio é sempre "teste"');
    }
    const data: Record<string, unknown> = { ...dto };
    for (const k of SEGREDOS) if (!data[k]) delete data[k];
    await this.prisma.systemConfig.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', ...data }, update: data });
    await this.audit.log({
      userId, acao: 'EDITAR_CONFIG', entidade: 'SystemConfig', entidadeId: 'singleton',
      detalhes: { campos: Object.keys(data), envioAutomatico: dto.envioAutomatico, smsMode: dto.smsMode },
    });
    return this.getConfig();
  }

  /*********************************************************************************************************************
  * @method       gerarIngestApiKey
  * @description  Generates a new random ingest API key (prefix 'ipma_sk_' + 64 hex chars) and
  *               stores it in the singleton SystemConfig row, replacing any existing key. Returns
  *               the new key exactly once; subsequent getConfig() calls only show the presence flag.
  * @param        userId — authenticated user id for audit logging
  * @return       Promise resolving to { apiKey: string }
  * @uses         PrismaService.systemConfig.upsert, AuditService.log, crypto.randomBytes
  *********************************************************************************************************************/
  async gerarIngestApiKey(userId: string): Promise<{ apiKey: string }> {
    const apiKey = 'ipma_sk_' + randomBytes(32).toString('hex');
    await this.prisma.systemConfig.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ingestApiKey: apiKey },
      update: { ingestApiKey: apiKey },
    });
    await this.audit.log({ userId, acao: 'GERAR_INGEST_API_KEY', entidade: 'SystemConfig', entidadeId: 'singleton', detalhes: { gerada: true } });
    return { apiKey };
  }

  /*********************************************************************************************************************
  * @method       getAuditLog
  * @description  Returns the most recent audit log entries, capped between 1 and 1000 rows.
  * @param        limit — maximum number of entries to return (default 100)
  * @return       Promise resolving to an array of AuditLog records
  * @uses         AuditService.findAll
  *********************************************************************************************************************/
  async getAuditLog(limit = 100) {
    return this.audit.findAll(Math.min(Math.max(limit, 1), 1000));
  }

  /*********************************************************************************************************************
  * @method       listarTabelasDados
  * @description  Lists the whitelisted tables of the backoffice "Dados" tab with their row counts.
  * @return       Promise resolving to an array of { key, label, total }
  *********************************************************************************************************************/
  async listarTabelasDados() {
    return Promise.all(TABELAS_DADOS.map(async t => ({
      key: t.key,
      label: t.label,
      total: await (this.prisma as any)[t.delegate].count(),
    })));
  }

  /*********************************************************************************************************************
  * @method       getDadosTabela
  * @description  Returns one page of a whitelisted table, read-only. Only the columns declared in the registry
  *               are selected, rows are flattened by dotted column key, and personal contacts are masked.
  *               Optional text search runs case-insensitively over the table's searchable fields.
  * @param        tabela — registry key of the table
  * @param        page — 1-based page number (clamped to the last page)
  * @param        pageSize — rows per page, between 1 and 100 (default 50)
  * @param        q — optional search text
  * @return       Promise resolving to { tabela, label, colunas, items, total, page, pageSize, totalPages }
  *********************************************************************************************************************/
  async getDadosTabela(tabela: string, page = 1, pageSize = 50, q?: string) {
    const t: TabelaDados | undefined = TABELAS_DADOS.find(x => x.key === tabela);
    if (!t) throw new NotFoundException('Tabela desconhecida');
    const delegate = (this.prisma as any)[t.delegate];
    const size = Math.min(Math.max(Number.isFinite(pageSize) ? pageSize : 50, 1), 100);
    const termo = q?.trim().slice(0, 100);
    const where = termo && t.pesquisa.length
      ? { OR: t.pesquisa.map(campo => ({ [campo]: { contains: termo, mode: 'insensitive' } })) }
      : undefined;
    const total: number = await delegate.count({ where });
    const totalPages = Math.max(Math.ceil(total / size), 1);
    const current = Math.min(Math.max(Number.isFinite(page) ? page : 1, 1), totalPages);
    const rows: any[] = await delegate.findMany({
      where,
      orderBy: t.orderBy,
      skip: (current - 1) * size,
      take: size,
      select: construirSelect(t.colunas),
    });
    const items = rows.map(row => Object.fromEntries(t.colunas.map(col => {
      const v = valorPorCaminho(row, col.key);
      return [col.key, col.mascara ? mascarar(v, col.mascara === Mascara.EMAIL ? 'email' : 'telefone') || null : v];
    })));
    return {
      tabela: t.key,
      label: t.label,
      colunas: t.colunas.map(({ key, label, tipo }) => ({ key, label, tipo })),
      items, total, page: current, pageSize: size, totalPages,
    };
  }

  /*********************************************************************************************************************
  * @method       getHealth
  * @description  Returns a public health summary for load balancers and monitoring tools. Contains
  *               only numeric status flags, never host names, error messages or configuration values.
  * @return       Promise resolving to { status, db, ambiente, modoEnvio, envioSimulado, timestamp, componentes }
  *               where componentes maps each component name to its EstadoSaude string
  * @uses         SystemService.saudeDetalhada
  *********************************************************************************************************************/
  async getHealth() {
    const d = await this.saudeDetalhada();
    return {
      status: d.status, db: d.db, ambiente: d.ambiente, modoEnvio: d.modoEnvio, envioSimulado: d.envioSimulado, timestamp: d.timestamp,
      componentes: Object.fromEntries(Object.entries(d.componentes).map(([k, v]) => [k, v.estado])),
    };
  }
}
