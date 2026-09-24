import { Controller, Get, Headers, Header, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { MetricsService } from './metrics.service';

/** Exposição Prometheus. Se METRICS_TOKEN estiver definido, exige "Authorization: Bearer <token>". */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private metrics: MetricsService, private config: ConfigService) {}

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
