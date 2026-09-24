import { Controller, Get, Put, Post, Body, Query, UseGuards, Request, ForbiddenException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SystemService } from './system.service';
import { UpdateConfigDto } from './dto/update-config.dto';
import { PollingService } from '../polling/polling.service';
import { AuditService } from '../audit/audit.service';

@ApiTags('system')
@ApiBearerAuth()
@Controller('system')
export class SystemController {
  constructor(private svc: SystemService, private polling: PollingService, private auditoria: AuditService) {}

  /** 200 com status ok/degraded; 503 se a base de dados estiver indisponível. */
  @Get('health')
  async health(@Res({ passthrough: true }) res: Response) {
    const h = await this.svc.getHealth();
    if (h.status === 'down') res.status(503);
    return h;
  }

  @UseGuards(JwtAuthGuard)
  @Get('saude')
  saude(@Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.saudeDetalhada();
  }

  @UseGuards(JwtAuthGuard)
  @Get('config')
  getConfig(@Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.getConfig();
  }

  @UseGuards(JwtAuthGuard)
  @Put('config')
  updateConfig(@Request() req: any, @Body() dto: UpdateConfigDto) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.updateConfig(dto, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('testar/smtp')
  testarSmtp(@Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.testarSmtp(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('testar/ftp')
  testarFtp(@Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.testarFtp(req.user.id);
  }

  /** Força uma leitura imediata do FTP (processa os XML pendentes). */
  @UseGuards(JwtAuthGuard)
  @Post('polling')
  async forcarPolling(@Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    const r = await this.polling.pollFtp();
    await this.auditoria.log({ userId: req.user.id, acao: 'FORCAR_POLLING', entidade: 'SystemConfig', entidadeId: 'FTP', detalhes: r });
    return r;
  }

  @UseGuards(JwtAuthGuard)
  @Get('audit')
  audit(@Request() req: any, @Query('limit') limit?: string) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.getAuditLog(limit ? parseInt(limit, 10) : 100);
  }
}
