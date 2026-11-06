import { Controller, Get, Headers, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { PollingService } from './polling.service';

/***********************************************************************************************************************
* @class         PollingController
* @description   NestJS REST controller that exposes a manual FTP polling trigger for external schedulers
*                such as Vercel Cron. The endpoint validates a Bearer token against the CRON_SECRET
*                environment variable and does not exist when that variable is not set.
*
* @responsibilities
*                 - Authenticate inbound cron requests using timing-safe Bearer token comparison
*                 - Delegate the actual FTP poll to PollingService
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Returns 404 when CRON_SECRET is not configured to avoid revealing endpoint existence.
*                 - Uses timingSafeEqual from Node.js crypto to prevent timing-based token extraction.
*
*               Notes for future enhancements:
*                 - Add rate limiting to protect against brute-force attempts on the cron secret.
***********************************************************************************************************************/
@ApiExcludeController()
@Controller('cron')
export class PollingController {
  constructor(private polling: PollingService, private config: ConfigService) {}

  /*********************************************************************************************************************
  * @method       executar
  * @description  Handles GET /cron/polling. Validates the Authorization Bearer token with timing-safe
  *               comparison against CRON_SECRET, then triggers a full FTP poll via PollingService.
  * @param        auth — Authorization header value (expected: "Bearer <CRON_SECRET>")
  * @return       FTP poll result with origem, ficheiros count and optional erro
  * @uses         PollingService.pollFtp
  *********************************************************************************************************************/
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
