import { Controller, Get, Headers, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { PollingService } from './polling.service';

/**
 * Polling FTP acionado por um agendador externo (Vercel Cron envia "Authorization: Bearer $CRON_SECRET").
 * Sem CRON_SECRET definido o endpoint não existe.
 */
@ApiExcludeController()
@Controller('cron')
export class PollingController {
  constructor(private polling: PollingService, private config: ConfigService) {}

  @Get('polling')
  async executar(@Headers('authorization') auth?: string) {
    const segredo = this.config.get<string>('CRON_SECRET');
    if (!segredo) throw new NotFoundException();
    const recebido = Buffer.from((auth ?? '').replace(/^Bearer\s+/i, ''));
    const esperado = Buffer.from(segredo);
    if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) throw new UnauthorizedException();
    return this.polling.pollFtp();
  }
}
