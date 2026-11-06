import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { MetricsService, M } from './metrics.service';

const SILENCIOSOS = ['/api/system/health', '/api/metrics'];
const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/***********************************************************************************************************************
* @class         RequestLoggerMiddleware
* @description   NestJS middleware that assigns a request ID to every incoming HTTP request,
*                emits a structured JSON log line for each completed response, and increments
*                the HTTP Prometheus metrics.
*
* @responsibilities
*                 - Accept the x-request-id header from upstream proxies when it matches the
*                   allowed pattern; generate a UUID otherwise
*                 - Echo the request ID back in the x-request-id response header
*                 - Emit a JSON log line on response finish with method, path, status, duration
*                   and authenticated user ID; suppress 2xx lines for health and metrics paths
*                 - Increment HTTP_PEDIDOS, HTTP_DURACAO_SOMA and HTTP_DURACAO_CONTAGEM counters
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Timing uses process.hrtime.bigint() for sub-millisecond precision.
*                 - The log level for each response is determined by the HTTP status code:
*                   5xx → error, 4xx → warn, 2xx/3xx → log.
*                 - SILENCIOSOS paths suppress successful (< 400) log lines to avoid cluttering
*                   logs from frequent polling by load balancers and Prometheus scrapers.
***********************************************************************************************************************/
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(private metrics: MetricsService) {}

  /*********************************************************************************************************************
  * @method       use
  * @description  Processes each incoming request: assigns a request ID, registers a 'finish'
  *               listener on the response to emit the log line and update metrics, then calls next().
  * @param        req — Express request object; requestId is attached as req.requestId
  * @param        res — Express response object; x-request-id header is added
  * @param        next — Express next function to pass control to the next middleware
  * @return       void
  * @uses         MetricsService.inc, Logger.log, Logger.warn, Logger.error
  *********************************************************************************************************************/
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
