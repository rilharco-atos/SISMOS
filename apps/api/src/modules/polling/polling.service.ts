import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as ftp from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ComunicadosService, SYSTEM_USER_ID } from '../comunicados/comunicados.service';
import { DeliveryService } from '../delivery/delivery.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { FtpSettings } from '../settings/settings.resolver';
import { MetricsService, M } from '../observability/metrics.service';
import { avaliarEnvioAutomatico } from '../comunicados/templates';
import { apagarFicheiro } from '../../common/fs.util';

/***********************************************************************************************************************
* @class         PollingService
* @description   Injectable NestJS service that polls an FTP server for incoming seismic bulletin XML files,
*                parses them, creates bulletin records and optionally triggers automatic delivery. Implements
*                OnModuleInit to create the required local staging directories on startup.
*
* @responsibilities
*                 - Run a @Cron-scheduled tick every 5 seconds respecting the configured poll interval
*                 - Connect to FTP, list and download pending XML files from the incoming directory
*                 - Create bulletin records via ComunicadosService and archive processed files
*                 - Optionally approve and deliver bulletins automatically when envioAutomatico is enabled
*                 - Expose pollFtp() for manual triggering from SystemModule and PollingController
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - In Vercel environments SCHEDULER must be 'externo'; local dirs use os.tmpdir().
*                 - The processing flag prevents concurrent polls from running simultaneously.
*                 - Files are archived to the processed directory before delivery to ensure at-most-once import.
*
*               Notes for future enhancements:
*                 - Add dead-letter handling for XML files that fail parsing repeatedly.
***********************************************************************************************************************/
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

  /*********************************************************************************************************************
  * @method       agendamento
  * @description  Read-only property indicating whether polling is scheduled internally via the in-process
  *               @Cron or externally via HTTP from Vercel Cron or another scheduler.
  * @return       'interno' for in-process cron; 'externo' for HTTP-triggered polling
  *********************************************************************************************************************/
  get agendamento(): 'interno' | 'externo' {
    const v = (this.config.get<string>('SCHEDULER') ?? '').toLowerCase();
    if (v === 'interno' || v === 'externo') return v;
    return this.config.get('VERCEL') ? 'externo' : 'interno';
  }

  /*********************************************************************************************************************
  * @method       pasta
  * @description  Returns the local directory path for FTP incoming or processed files. Uses a tmp-based
  *               path in read-only environments (Vercel) and a local ftp/ subdirectory otherwise.
  * @param        tipo — 'incoming' for files awaiting processing; 'processed' for archived files
  * @return       Absolute path to the requested local FTP staging directory
  *********************************************************************************************************************/
  private pasta(tipo: 'incoming' | 'processed'): string {
    const definida = this.config.get<string>(tipo === 'incoming' ? 'FTP_LOCAL_INCOMING_DIR' : 'FTP_LOCAL_PROCESSED_DIR');
    return definida ?? (this.config.get('VERCEL') ? path.join(os.tmpdir(), 'ftp', tipo) : path.join('.', 'ftp', tipo));
  }

  /*********************************************************************************************************************
  * @method       onModuleInit
  * @description  NestJS lifecycle hook that creates the local incoming and processed FTP staging directories
  *               on module startup. Logs a warning when a directory cannot be created.
  *********************************************************************************************************************/
  onModuleInit() {
    for (const tipo of ['incoming', 'processed'] as const) {
      try {
        fs.mkdirSync(this.pasta(tipo), { recursive: true });
      } catch (e: any) {
        this.logger.warn(JSON.stringify({ msg: 'Pasta local do FTP indisponível', pasta: this.pasta(tipo), erro: e.message }));
      }
    }
  }

  /*********************************************************************************************************************
  * @method       tick
  * @description  @Cron callback fired every 5 seconds. Skips when a poll is already in progress, when
  *               agendamento is 'externo', or when the configured poll interval has not elapsed yet.
  * @uses         SettingsService.ftp, PollingService.pollFtp
  *********************************************************************************************************************/
  @Cron(CronExpression.EVERY_5_SECONDS)
  async tick() {
    if (this.processing || this.agendamento !== 'interno') return;
    const ftpCfg = await this.settings.ftp();
    if (!ftpCfg.host || Date.now() - this.ultimoPoll < ftpCfg.pollIntervalMs) return;
    await this.pollFtp(ftpCfg);
  }

  /*********************************************************************************************************************
  * @method       pollFtp
  * @description  Connects to the configured FTP server, lists XML files in the incoming directory,
  *               downloads and processes each one, archives the file on both FTP and locally, and
  *               optionally triggers automatic delivery. Returns a summary of the poll.
  * @param        ftpCfg — optional pre-loaded FTP settings; loaded from SettingsService when absent
  * @return       Object with origem string, ficheiros count and optional erro message
  * @process      1. Guard against concurrent polls with the processing flag
  *               2. Connect to FTP and list XML files in the incoming directory
  *               3. For each file: download, strip BOM, parse, create bulletin, archive on FTP and locally
  *               4. Trigger envioAutomatico() for each successfully imported bulletin
  *               5. Archive rejected XML files with REJEITADO_ prefix; record in audit log
  * @uses         ComunicadosService.createFromXml, PollingService.envioAutomatico, AuditService.log
  *********************************************************************************************************************/
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
      const localIn = this.pasta('incoming');
      const localProc = this.pasta('processed');

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

          await client.rename(remotePath, `${processedDir}/${nome}`).catch(() => client.remove(remotePath).catch(() => undefined));
          fs.renameSync(localPath, path.join(localProc, nome));

          processados++;
          this.metrics.inc(M.XML_PROCESSADOS, { resultado: 'importado' });
          await this.envioAutomatico(comunicado, nome);
        } catch (e: any) {
          this.metrics.inc(M.XML_PROCESSADOS, { resultado: e instanceof BadRequestException ? 'rejeitado' : 'erro' });
          if (e instanceof BadRequestException) {
            await client.rename(remotePath, `${processedDir}/REJEITADO_${nome}`).catch(() => undefined);
            apagarFicheiro(localPath);
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

  /*********************************************************************************************************************
  * @method       envioAutomatico
  * @description  Automatically approves and delivers a bulletin when the envioAutomatico setting is enabled
  *               and the bulletin text passes the completeness check. Retains for manual review when the
  *               check fails and records the outcome in the audit log.
  * @param        comunicado — the newly imported bulletin object from ComunicadosService
  * @param        ficheiro — source filename used in audit log entries
  * @uses         SettingsService.envioAutomatico, ComunicadosService.aprovar, DeliveryService.enviarComunicado
  *********************************************************************************************************************/
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
