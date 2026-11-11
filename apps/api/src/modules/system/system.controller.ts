import { Controller, Get, Put, Post, Body, Param, Query, UseGuards, Request, ForbiddenException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SystemService } from './system.service';
import { UpdateConfigDto } from './dto/update-config.dto';
import { PollingService } from '../polling/polling.service';
import { AuditService } from '../audit/audit.service';

/***********************************************************************************************************************
* @class         SystemController
* @description   NestJS REST controller for system administration, health monitoring and configuration.
*                Exposes a public health endpoint and a set of ADMIN-only endpoints for backoffice
*                configuration, connectivity tests, forced polling and audit log access.
*
* @responsibilities
*                 - Serve the public GET /system/health endpoint for load balancers and monitors
*                 - Provide detailed health state to ADMIN users via GET /system/saude
*                 - CRUD for the singleton SystemConfig row (ADMIN only)
*                 - Trigger connectivity tests for SMTP and FTP on demand (ADMIN only)
*                 - Force an immediate FTP poll and return the result (ADMIN only)
*                 - Generate a new ingest API key (ADMIN only)
*                 - Return the audit log (ADMIN only)
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - The /health endpoint has no auth guard and returns HTTP 503 when the DB is down.
*                 - All other endpoints are guarded by JwtAuthGuard; role is checked manually inside
*                   each handler to reuse the already-resolved req.user object.
***********************************************************************************************************************/
@ApiTags('system')
@ApiBearerAuth()
@Controller('system')
export class SystemController {
  constructor(private svc: SystemService, private polling: PollingService, private auditoria: AuditService) {}

  /*********************************************************************************************************************
  * @method       health
  * @description  Public health endpoint for load balancers and monitoring. Returns HTTP 503 when
  *               the database is unreachable. Never exposes host names or error messages.
  * @param        res — Express response used to set the 503 status code when status is 'down'
  * @return       Promise resolving to the public health summary object
  * @uses         SystemService.getHealth
  *********************************************************************************************************************/
  @Get('health')
  async health(@Res({ passthrough: true }) res: Response) {
    const h = await this.svc.getHealth();
    if (h.status === 'down') res.status(503);
    return h;
  }

  /*********************************************************************************************************************
  * @method       saude
  * @description  Returns the detailed component health state including messages, last success/error
  *               timestamps and the global status. Restricted to ADMIN role.
  * @param        req — Express request with the authenticated user
  * @return       Promise resolving to the detailed health object from SystemService.saudeDetalhada
  * @uses         SystemService.saudeDetalhada
  *********************************************************************************************************************/
  @UseGuards(JwtAuthGuard)
  @Get('saude')
  saude(@Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.saudeDetalhada();
  }

  /*********************************************************************************************************************
  * @method       getConfig
  * @description  Returns the current system configuration for the backoffice UI. Secret fields are
  *               redacted. Restricted to ADMIN role.
  * @param        req — Express request with the authenticated user
  * @return       Promise resolving to the sanitised config object from SystemService.getConfig
  * @uses         SystemService.getConfig
  *********************************************************************************************************************/
  @UseGuards(JwtAuthGuard)
  @Get('config')
  getConfig(@Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.getConfig();
  }

  /*********************************************************************************************************************
  * @method       updateConfig
  * @description  Upserts the singleton system configuration row. Restricted to ADMIN role.
  * @param        req — Express request with the authenticated user
  * @param        dto — UpdateConfigDto with the fields to update
  * @return       Promise resolving to the updated config from SystemService.getConfig
  * @uses         SystemService.updateConfig
  *********************************************************************************************************************/
  @UseGuards(JwtAuthGuard)
  @Put('config')
  updateConfig(@Request() req: any, @Body() dto: UpdateConfigDto) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.updateConfig(dto, req.user.id);
  }

  /*********************************************************************************************************************
  * @method       testarSmtp
  * @description  Tests the effective SMTP or HTTP-email transport without sending a message.
  *               Restricted to ADMIN role.
  * @param        req — Express request with the authenticated user
  * @return       Promise resolving to { ok, origem, mensagem, duracaoMs }
  * @uses         SystemService.testarSmtp
  *********************************************************************************************************************/
  @UseGuards(JwtAuthGuard)
  @Post('testar/smtp')
  testarSmtp(@Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.testarSmtp(req.user.id);
  }

  /*********************************************************************************************************************
  * @method       testarFtp
  * @description  Tests the effective FTP connection by listing the incoming directory without
  *               processing any files. Restricted to ADMIN role.
  * @param        req — Express request with the authenticated user
  * @return       Promise resolving to { ok, origem, mensagem, duracaoMs }
  * @uses         SystemService.testarFtp
  *********************************************************************************************************************/
  @UseGuards(JwtAuthGuard)
  @Post('testar/ftp')
  testarFtp(@Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.testarFtp(req.user.id);
  }

  /*********************************************************************************************************************
  * @method       forcarPolling
  * @description  Forces an immediate FTP poll, processing any pending XML files. Logs the result
  *               to the audit trail. Restricted to ADMIN role.
  * @param        req — Express request with the authenticated user
  * @return       Promise resolving to the polling result from PollingService.pollFtp
  * @uses         PollingService.pollFtp, AuditService.log
  *********************************************************************************************************************/
  @UseGuards(JwtAuthGuard)
  @Post('polling')
  async forcarPolling(@Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    const r = await this.polling.pollFtp();
    await this.auditoria.log({ userId: req.user.id, acao: 'FORCAR_POLLING', entidade: 'SystemConfig', entidadeId: 'FTP', detalhes: r });
    return r;
  }

  /*********************************************************************************************************************
  * @method       gerarIngestApiKey
  * @description  Generates and stores a new ingest API key, replacing any existing one.
  *               Returns the new key exactly once. Restricted to ADMIN role.
  * @param        req — Express request with the authenticated user
  * @return       Promise resolving to { apiKey: string }
  * @uses         SystemService.gerarIngestApiKey
  *********************************************************************************************************************/
  @UseGuards(JwtAuthGuard)
  @Post('ingest-api-key/gerar')
  gerarIngestApiKey(@Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.gerarIngestApiKey(req.user.id);
  }

  /*********************************************************************************************************************
  * @method       audit
  * @description  Returns the most recent audit log entries. Accepts an optional limit query param
  *               (default 100, capped at 1000). Restricted to ADMIN role.
  * @param        req — Express request with the authenticated user
  * @param        limit — optional string query param; parsed as integer
  * @return       Promise resolving to an array of AuditLog records
  * @uses         SystemService.getAuditLog
  *********************************************************************************************************************/
  @UseGuards(JwtAuthGuard)
  @Get('audit')
  audit(@Request() req: any, @Query('limit') limit?: string) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.getAuditLog(limit ? parseInt(limit, 10) : 100);
  }

  /*********************************************************************************************************************
  * @method       dadosTabelas
  * @description  Lists the tables readable in the backoffice data tab, with row counts. ADMIN only.
  * @param        req — Express request with the authenticated user
  * @return       Promise resolving to an array of { key, label, total }
  * @uses         SystemService.listarTabelasDados
  *********************************************************************************************************************/
  @UseGuards(JwtAuthGuard)
  @Get('dados')
  dadosTabelas(@Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.listarTabelasDados();
  }

  /*********************************************************************************************************************
  * @method       dadosTabela
  * @description  Returns one page of a whitelisted table, read-only. ADMIN only.
  * @param        req — Express request with the authenticated user
  * @param        tabela — table key from the registry
  * @param        page — optional 1-based page number (default 1)
  * @param        pageSize — optional rows per page (default 50, max 100)
  * @param        q — optional search text
  * @return       Promise resolving to the page payload from SystemService.getDadosTabela
  * @uses         SystemService.getDadosTabela
  *********************************************************************************************************************/
  @UseGuards(JwtAuthGuard)
  @Get('dados/:tabela')
  dadosTabela(@Request() req: any, @Param('tabela') tabela: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('q') q?: string) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.getDadosTabela(tabela, page ? parseInt(page, 10) : 1, pageSize ? parseInt(pageSize, 10) : 50, q);
  }
}
