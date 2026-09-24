import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { MetricsService, M } from './metrics.service';

const SILENCIOSOS = ['/api/system/health', '/api/metrics'];
const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** Atribui um request-id (ou aceita o do proxy), regista cada pedido em JSON e alimenta as métricas HTTP. */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(private metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const inicio = process.hrtime.bigint();
    const recebido = req.header('x-request-id');
    const requestId = recebido && REQUEST_ID.test(recebido) ? recebido : randomUUID();
    (req as any).requestId = requestId;
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
      const segundos = Number(process.hrtime.bigint() - inicio) / 1e9;
      const caminho = req.originalUrl.split('?')[0];
      this.metrics.inc(M.HTTP_PEDIDOS, { method: req.method, status: String(res.statusCode) });
      this.metrics.inc(M.HTTP_DURACAO_SOMA, { method: req.method }, segundos);
      this.metrics.inc(M.HTTP_DURACAO_CONTAGEM, { method: req.method });
      if (SILENCIOSOS.includes(caminho) && res.statusCode < 400) return;
      const evento = JSON.stringify({
        msg: 'http', requestId, method: req.method, path: caminho, status: res.statusCode,
        durationMs: Math.round(segundos * 1000), userId: (req as any).user?.id,
      });
      if (res.statusCode >= 500) this.logger.error(evento);
      else if (res.statusCode >= 400) this.logger.warn(evento);
      else this.logger.log(evento);
    });
    next();
  }
}
