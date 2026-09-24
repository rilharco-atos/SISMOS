import { LoggerService, LogLevel } from '@nestjs/common';

const NIVEIS: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

/**
 * Logger JSON estruturado (uma linha por evento, em stdout/stderr) para recolha por
 * Loki/ELK/journald. Mensagens que já sejam JSON são fundidas no evento.
 */
export class JsonLogger implements LoggerService {
  private minimo: number;

  constructor(nivel: string = process.env.LOG_LEVEL ?? 'log') {
    const i = NIVEIS.indexOf(nivel as LogLevel);
    this.minimo = i === -1 ? NIVEIS.indexOf('log') : i;
  }

  log(message: unknown, ...params: unknown[]) { this.escrever('log', message, params); }
  error(message: unknown, ...params: unknown[]) { this.escrever('error', message, params); }
  warn(message: unknown, ...params: unknown[]) { this.escrever('warn', message, params); }
  debug(message: unknown, ...params: unknown[]) { this.escrever('debug', message, params); }
  verbose(message: unknown, ...params: unknown[]) { this.escrever('verbose', message, params); }
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
