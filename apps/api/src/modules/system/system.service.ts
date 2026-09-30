import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as ftp from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { MetricsService } from '../observability/metrics.service';
import { WebsiteService } from '../website/website.service';
import { UpdateConfigDto } from './dto/update-config.dto';
import { avaliarBackup, avaliarEnvio, avaliarFtp, avaliarWebsite, estadoGlobal } from './saude';

const SEGREDOS = ['ftpPassword', 'smtpPassword'] as const;

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

  /** Configuração para o backoffice: as passwords nunca saem do servidor, apenas se estão definidas. */
  async getConfig() {
    const cfg = await this.prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
    if (!cfg) return null;
    const { ftpPassword, smtpPassword, ...resto } = cfg;
    const [ftp, smtp, sms] = await Promise.all([this.settings.ftp(), this.settings.smtp(), this.settings.sms()]);
    return {
      ...resto, ftpPassword: '', smtpPassword: '', temFtpPassword: !!ftpPassword, temSmtpPassword: !!smtpPassword,
      origemFtp: ftp.origem, origemSmtp: smtp.origem,
      ambiente: this.settings.ambiente(), modoEnvio: sms.modo, modoImpostoPeloAmbiente: sms.impostoPeloAmbiente,
      website: this.website.integracao,
    };
  }

  /** Estado detalhado de cada componente (apenas administradores). */
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

  /** Data do ficheiro de backup mais recente na pasta partilhada com o serviço de backup. */
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

  /** Verifica a ligação e autenticação com a configuração efetiva, sem enviar mensagens. */
  async testarSmtp(userId: string) {
    const smtp = await this.settings.smtp();
    const inicio = Date.now();

    // Com chave de API o envio é por HTTPS e não há ligação SMTP para verificar.
    // Sonda-se o endpoint de envio com um corpo vazio: separa autenticação de
    // payload, porque 401/403 é chave recusada e 422 é chave aceite com campos
    // em falta. Não serve consultar /domains — as chaves de envio do Resend,
    // que são as mais comuns, não têm permissão para esse endpoint e dão 401.
    if (smtp.apiKey) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${smtp.apiKey}`, 'Content-Type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(10000),
        });
        if (res.status === 401 || res.status === 403) {
          const corpo: any = await res.json().catch(() => null);
          throw new Error(corpo?.message ?? `chave recusada (${res.status})`);
        }
        return this.resultadoTeste(userId, 'SMTP', true, smtp.origem, 'Envio por HTTPS (Resend) — chave aceite', inicio);
      } catch (e: any) {
        return this.resultadoTeste(userId, 'SMTP', false, smtp.origem, `Envio por HTTPS (Resend): ${e.message}`, inicio);
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

  /** Liga ao FTP com a configuração efetiva e conta os XML na pasta de entrada, sem os processar. */
  async testarFtp(userId: string) {
    const cfg = await this.settings.ftp();
    if (!cfg.host) return { ok: false, origem: cfg.origem, mensagem: 'Servidor FTP não configurado' };
    const inicio = Date.now();
    const client = new ftp.Client(10000);
    try {
      await client.access({ host: cfg.host, user: cfg.user, password: cfg.password, secure: false });
      const xmls = (await client.list(cfg.incomingDir)).filter(f => f.name.endsWith('.xml') && f.type === ftp.FileType.File).length;
      return this.resultadoTeste(userId, 'FTP', true, cfg.origem, `Ligação a ${cfg.host} aceite · ${xmls} ficheiro(s) XML em ${cfg.incomingDir}`, inicio);
    } catch (e: any) {
      return this.resultadoTeste(userId, 'FTP', false, cfg.origem, e.message, inicio);
    } finally {
      client.close();
    }
  }

  private async resultadoTeste(userId: string, servico: string, ok: boolean, origem: string, mensagem: string, inicio: number) {
    const duracaoMs = Date.now() - inicio;
    await this.audit.log({ userId, acao: 'TESTAR_LIGACAO', entidade: 'SystemConfig', entidadeId: servico, detalhes: { ok, origem, duracaoMs, mensagem } });
    return { ok, origem, mensagem, duracaoMs };
  }

  /** Atualiza a configuração. Passwords vazias são ignoradas (mantém-se a atual). */
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

  async getAuditLog(limit = 100) {
    return this.audit.findAll(Math.min(Math.max(limit, 1), 1000));
  }

  /** Health público (monitorização/balanceador): só estados, sem mensagens nem nomes de servidores. */
  async getHealth() {
    const d = await this.saudeDetalhada();
    return {
      status: d.status, db: d.db, ambiente: d.ambiente, modoEnvio: d.modoEnvio, envioSimulado: d.envioSimulado, timestamp: d.timestamp,
      componentes: Object.fromEntries(Object.entries(d.componentes).map(([k, v]) => [k, v.estado])),
    };
  }
}
