import { LoggerService, LogLevel } from '@nestjs/common';

const NIVEIS: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

/***********************************************************************************************************************
* @class         JsonLogger
* @description   NestJS LoggerService implementation that emits one JSON line per event to
*                stdout (info/debug) or stderr (warn/error/fatal), suitable for collection by
*                Loki, ELK or journald. Incoming message objects and JSON strings are merged
*                into the event rather than serialised as nested values.
*
* @responsibilities
*                 - Implement the NestJS LoggerService interface for all six log levels
*                 - Filter events below the configured minimum level
*                 - Emit structured JSON with ts, level, service and context fields
*                 - Merge message objects and parse JSON-string messages into the event payload
*                 - Route warn/error/fatal to stderr and all others to stdout
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - The minimum level is read from LOG_LEVEL env var at construction time,
*                   defaulting to 'log'. Unknown level strings fall back to 'log'.
*                 - The last element of params is treated as the context string (NestJS convention).
*                 - Error stack traces passed as the first param (a multi-line string) are attached
*                   to the event under the 'stack' key.
***********************************************************************************************************************/
export class JsonLogger implements LoggerService {
  private minimo: number;

  constructor(nivel: string = process.env.LOG_LEVEL ?? 'log') {
    const i = NIVEIS.indexOf(nivel as LogLevel);
    this.minimo = i === -1 ? NIVEIS.indexOf('log') : i;
  }

  /*********************************************************************************************************************
  * @method       log
  * @description  Emits an event at the 'log' level.
  * @param        message — message string, object or Error
  * @param        params — optional NestJS params; last string element is the context
  * @return       void
  * @uses         JsonLogger.escrever
  *********************************************************************************************************************/
  log(message: unknown, ...params: unknown[]) { this.escrever('log', message, params); }

  /*********************************************************************************************************************
  * @method       error
  * @description  Emits an event at the 'error' level to stderr.
  * @param        message — message string, object or Error
  * @param        params — optional NestJS params; last string element is the context
  * @return       void
  * @uses         JsonLogger.escrever
  *********************************************************************************************************************/
  error(message: unknown, ...params: unknown[]) { this.escrever('error', message, params); }

  /*********************************************************************************************************************
  * @method       warn
  * @description  Emits an event at the 'warn' level to stderr.
  * @param        message — message string, object or Error
  * @param        params — optional NestJS params; last string element is the context
  * @return       void
  * @uses         JsonLogger.escrever
  *********************************************************************************************************************/
  warn(message: unknown, ...params: unknown[]) { this.escrever('warn', message, params); }

  /*********************************************************************************************************************
  * @method       debug
  * @description  Emits an event at the 'debug' level.
  * @param        message — message string, object or Error
  * @param        params — optional NestJS params; last string element is the context
  * @return       void
  * @uses         JsonLogger.escrever
  *********************************************************************************************************************/
  debug(message: unknown, ...params: unknown[]) { this.escrever('debug', message, params); }

  /*********************************************************************************************************************
  * @method       verbose
  * @description  Emits an event at the 'verbose' level.
  * @param        message — message string, object or Error
  * @param        params — optional NestJS params; last string element is the context
  * @return       void
  * @uses         JsonLogger.escrever
  *********************************************************************************************************************/
  verbose(message: unknown, ...params: unknown[]) { this.escrever('verbose', message, params); }

  /*********************************************************************************************************************
  * @method       fatal
  * @description  Emits an event at the 'fatal' level to stderr.
  * @param        message — message string, object or Error
  * @param        params — optional NestJS params; last string element is the context
  * @return       void
  * @uses         JsonLogger.escrever
  *********************************************************************************************************************/
  fatal(message: unknown, ...params: unknown[]) { this.escrever('fatal', message, params); }

  private escrever(nivel: LogLevel, message: unknown, params: unknown[]) {
    if (NIVEIS.indexOf(nivel) > this.minimo) return;
    const contexto = typeof params[params.length - 1] === 'string' ? (params.pop() as string) : undefined;
    const stack = nivel === 'error' && typeof params[0] === 'string' && params[0].includes('\n') ? params[0] : undefined;
    const evento: Record<string, unknown> = { ts: new Date().toISOString(), level: nivel, service: 'sismos-api', context: contexto };

    if (typeof message === 'string' && message.startsWith('{')) {
      try { Object.assign(evento, JSON.parse(message)); } catch { evento.msg = message; }
    } else if (message instanceof Error) {
      evento.msg = message.message;
      evento.stack = message.stack;
    } else if (typeof message === 'object' && message !== null) {
      Object.assign(evento, message);
    } else {
      evento.msg = String(message);
    }
    if (stack) evento.stack = stack;

    const linha = JSON.stringify(evento);
    if (nivel === 'error' || nivel === 'fatal' || nivel === 'warn') process.stderr.write(`${linha}\n`);
    else process.stdout.write(`${linha}\n`);
  }
}
