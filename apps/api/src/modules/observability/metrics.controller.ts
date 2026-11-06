import { Controller, Get, Headers, Header, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { MetricsService } from './metrics.service';

/***********************************************************************************************************************
* @class         MetricsController
* @description   NestJS controller that exposes the Prometheus metrics scrape endpoint at
*                GET /api/metrics. When the METRICS_TOKEN environment variable is set, the
*                endpoint requires a matching Bearer token to prevent unauthorised access.
*
* @responsibilities
*                 - Serve Prometheus text exposition format 0.0.4 with the correct Content-Type
*                 - Validate the Authorization header against METRICS_TOKEN using timing-safe comparison
*                 - Exclude this controller from the OpenAPI/Swagger documentation
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - timingSafeEqual prevents timing attacks on token comparison.
*                 - The controller is excluded from Swagger to avoid cluttering the API docs.
*                 - When METRICS_TOKEN is absent, the endpoint is public (intended for internal
*                   network-only deployments where network-level access control is sufficient).
***********************************************************************************************************************/
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private metrics: MetricsService, private config: ConfigService) {}

  /*********************************************************************************************************************
  * @method       expor
  * @description  Returns the full Prometheus metrics text. Validates the Bearer token when
  *               METRICS_TOKEN is configured; throws UnauthorizedException on mismatch.
  * @param        auth — value of the Authorization request header (may be undefined)
  * @return       Prometheus text exposition format string
  * @uses         MetricsService.render, ConfigService.get, timingSafeEqual
  *********************************************************************************************************************/
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  expor(@Headers('authorization') auth?: string): string {
    const token = this.config.get<string>('METRICS_TOKEN');
    if (token) {
      const recebido = Buffer.from((auth ?? '').replace(/^Bearer\s+/i, ''));
      const esperado = Buffer.from(token);
      if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) throw new UnauthorizedException();
    }
    return this.metrics.render();
  }
}
