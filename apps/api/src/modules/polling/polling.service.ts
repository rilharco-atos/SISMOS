import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as ftp from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';
import { ComunicadosService, SYSTEM_USER_ID } from '../comunicados/comunicados.service';
import { DeliveryService } from '../delivery/delivery.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { FtpSettings } from '../settings/settings.resolver';
import { MetricsService, M } from '../observability/metrics.service';
import { avaliarEnvioAutomatico } from '../comunicados/templates';

@Injectable()
export class PollingService implements OnModuleInit {
  private readonly logger = new Logger(PollingService.name);
  private processing = false;
  private ultimoPoll = 0;

  constructor(
    private config: ConfigService,
    private comunicados: ComunicadosService,
    private delivery: DeliveryService,
    private audit: AuditService,
    private settings: SettingsService,
    private metrics: MetricsService,
  ) {}

  onModuleInit() {
    fs.mkdirSync(this.config.get('FTP_LOCAL_INCOMING_DIR', './ftp/incoming'), { recursive: true });
    fs.mkdirSync(this.config.get('FTP_LOCAL_PROCESSED_DIR', './ftp/processed'), { recursive: true });
  }

  /** Verifica a cada 5 s; o polling efetivo respeita o intervalo configurado no backoffice. */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async tick() {
    if (this.processing) return;
    const ftpCfg = await this.settings.ftp();
    if (!ftpCfg.host || Date.now() - this.ultimoPoll < ftpCfg.pollIntervalMs) return;
    await this.pollFtp(ftpCfg);
  }

  /** Lê os XML novos da pasta de entrada do FTP, cria os comunicados e arquiva os ficheiros. */
  async pollFtp(ftpCfg?: FtpSettings): Promise<{ origem: string; ficheiros: number; erro?: string }> {
    if (this.processing) return { origem: '', ficheiros: 0, erro: 'Já existe um polling em curso' };
    const cfg = ftpCfg ?? await this.settings.ftp();
    if (!cfg.host) return { origem: cfg.origem, ficheiros: 0, erro: 'Servidor FTP não configurado' };
    this.processing = true;
    this.ultimoPoll = Date.now();
    let processados = 0;
    let erroGeral: string | undefined;

    const client = new ftp.Client(15000);
    client.ftp.verbose = false;

    try {
      await client.access({ host: cfg.host, user: cfg.user, password: cfg.password, secure: false });

      const incomingDir = cfg.incomingDir;
      const processedDir = cfg.processedDir;
      const localIn = this.config.get('FTP_LOCAL_INCOMING_DIR', './ftp/incoming');
      const localProc = this.config.get('FTP_LOCAL_PROCESSED_DIR', './ftp/processed');

      const list = await client.list(incomingDir);
      const xmlFiles = list.filter(f => f.name.endsWith('.xml') && f.type === ftp.FileType.File);
      this.metrics.set(M.FTP_ULTIMO_SUCESSO, Math.floor(Date.now() / 1000));
      this.metrics.sucesso('ftp', { origem: cfg.origem, host: cfg.host, pendentes: xmlFiles.length });

      for (const file of xmlFiles) {
        const nome = path.basename(file.name);
        const remotePath = `${incomingDir}/${nome}`;
        const localPath = path.join(localIn, nome);

        try {
          await client.downloadTo(localPath, remotePath);
          const xml = fs.readFileSync(localPath, 'utf-8').replace(/^﻿/, '');
          const comunicado = await this.comunicados.createFromXml(xml, SYSTEM_USER_ID);
          this.logger.log(JSON.stringify({ msg: 'Comunicado importado via FTP', ficheiro: nome, referencia: comunicado.referencia }));

          // O ficheiro é arquivado antes do envio: uma falha no envio não pode levar a reimportar o evento.
          await client.rename(remotePath, `${processedDir}/${nome}`).catch(() => client.remove(remotePath).catch(() => undefined));
          fs.renameSync(localPath, path.join(localProc, nome));

          processados++;
          this.metrics.inc(M.XML_PROCESSADOS, { resultado: 'importado' });
          await this.envioAutomatico(comunicado, nome);
        } catch (e: any) {
          this.metrics.inc(M.XML_PROCESSADOS, { resultado: e instanceof BadRequestException ? 'rejeitado' : 'erro' });
          if (e instanceof BadRequestException) {
            // XML inválido não volta a ser processado: é arquivado com prefixo e fica registado.
            await client.rename(remotePath, `${processedDir}/REJEITADO_${nome}`).catch(() => undefined);
            fs.rmSync(localPath, { force: true });
            await this.audit.log({ userId: SYSTEM_USER_ID, acao: 'XML_REJEITADO', entidade: 'Ficheiro', entidadeId: nome, detalhes: { erro: e.message } });
          }
          this.logger.error(JSON.stringify({ msg: 'Erro a processar ficheiro FTP', ficheiro: nome, erro: e.message }));
        }
      }
    } catch (e: any) {
      erroGeral = e.message;
      this.metrics.inc(M.FTP_ERROS);
      this.metrics.erro('ftp', e.message, { origem: cfg.origem, host: cfg.host });
      this.logger.error(JSON.stringify({ msg: 'Erro no polling FTP', origem: cfg.origem, erro: e.message }));
    } finally {
      client.close();
      this.processing = false;
    }
    return { origem: cfg.origem, ficheiros: processados, erro: erroGeral };
  }

  /** Aprova e envia o comunicado automático se a configuração o permitir e o texto estiver completo. */
  async envioAutomatico(comunicado: any, ficheiro: string) {
    if (!(await this.settings.envioAutomatico())) return;

    const decisao = avaliarEnvioAutomatico(comunicado.texto, comunicado.emailListas ?? [], comunicado.smsListas ?? []);
    if (!decisao.enviar) {
      await this.audit.log({
        userId: SYSTEM_USER_ID, acao: 'ENVIO_AUTOMATICO_RETIDO', entidade: 'Comunicado', entidadeId: comunicado.id, comunicadoId: comunicado.id,
        detalhes: { ficheiro, motivo: decisao.motivo },
      });
      this.logger.warn(JSON.stringify({ msg: 'Envio automático retido para revisão', referencia: comunicado.referencia, motivo: decisao.motivo }));
      return;
    }

    try {
      await this.comunicados.aprovar(comunicado.id, SYSTEM_USER_ID);
      const r = await this.delivery.enviarComunicado(comunicado.id, comunicado.versoes[0].id, comunicado.emailListas, comunicado.smsListas, SYSTEM_USER_ID);
      this.logger.log(JSON.stringify({ msg: 'Envio automático concluído', referencia: comunicado.referencia, ...r }));
    } catch (e: any) {
      await this.audit.log({
        userId: SYSTEM_USER_ID, acao: 'ENVIO_AUTOMATICO_FALHOU', entidade: 'Comunicado', entidadeId: comunicado.id, comunicadoId: comunicado.id,
        detalhes: { ficheiro, erro: e.message },
      });
      this.logger.error(JSON.stringify({ msg: 'Falha no envio automático', referencia: comunicado.referencia, erro: e.message }));
    }
  }
}
