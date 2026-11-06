import type { EstadoComponente } from '../observability/metrics.service';

export type EstadoSaude = 'ok' | 'degradado' | 'erro' | 'desativado' | 'sem_dados';

export interface AvaliacaoComponente {
  estado: EstadoSaude;
  mensagem?: string;
  ultimoSucesso?: string;
  ultimoErro?: string;
}

const HORA = 60 * 60 * 1000;
const t = (s?: string) => (s ? new Date(s).getTime() : 0);

/*********************************************************************************************************************
* @method       avaliarFtp
* @description  Evaluates the health of the FTP polling subsystem. Returns 'desativado' when not
*               configured, 'sem_dados' before the first poll attempt, 'erro' when the last attempt
*               failed, and 'degradado' when no successful poll has occurred within 5 polling intervals.
* @param        e — current EstadoComponente for the FTP component (may be undefined before first poll)
* @param        configurado — whether the FTP server is configured
* @param        intervaloMs — configured polling interval in milliseconds
* @param        agora — reference timestamp (default: Date.now())
* @return       AvaliacaoComponente with estado, mensagem and last success/error timestamps
*********************************************************************************************************************/
export function avaliarFtp(e: EstadoComponente | undefined, configurado: boolean, intervaloMs: number, agora = Date.now()): AvaliacaoComponente {
  if (!configurado) return { estado: 'desativado', mensagem: 'Servidor FTP não configurado' };
  if (!e || (!e.ultimoSucesso && !e.ultimoErro)) return { estado: 'sem_dados', mensagem: 'Ainda sem polling' };
  const base = { ultimoSucesso: e.ultimoSucesso, ultimoErro: e.ultimoErro };
  if (t(e.ultimoErro) > t(e.ultimoSucesso)) return { ...base, estado: 'erro', mensagem: e.mensagemErro };
  if (agora - t(e.ultimoSucesso) > 5 * intervaloMs) return { ...base, estado: 'degradado', mensagem: 'Polling atrasado' };
  return { ...base, estado: 'ok' };
}

/*********************************************************************************************************************
* @method       avaliarEnvio
* @description  Evaluates the health of the email/SMS dispatch subsystem. Returns 'sem_dados' before
*               the first dispatch attempt, 'degradado' when the most recent dispatch failed within the
*               last 24 hours, and 'ok' otherwise.
* @param        e — current EstadoComponente for the dispatch component (may be undefined at startup)
* @param        agora — reference timestamp (default: Date.now())
* @return       AvaliacaoComponente with estado, mensagem and last success/error timestamps
*********************************************************************************************************************/
export function avaliarEnvio(e: EstadoComponente | undefined, agora = Date.now()): AvaliacaoComponente {
  if (!e || (!e.ultimoSucesso && !e.ultimoErro)) return { estado: 'sem_dados', mensagem: 'Sem envios desde o arranque' };
  const base = { ultimoSucesso: e.ultimoSucesso, ultimoErro: e.ultimoErro };
  if (t(e.ultimoErro) > t(e.ultimoSucesso) && agora - t(e.ultimoErro) < 24 * HORA) return { ...base, estado: 'degradado', mensagem: e.mensagemErro };
  return { ...base, estado: 'ok' };
}

/*********************************************************************************************************************
* @method       avaliarWebsite
* @description  Evaluates the health of the website integration. Returns 'desativado' when the
*               integration is not active, 'sem_dados' before the first operation, 'erro' when the
*               last operation failed, and 'ok' otherwise.
* @param        e — current EstadoComponente for the website component (may be undefined at startup)
* @param        ativa — whether the website integration is currently enabled
* @param        motivo — optional explanation string for the 'desativado' state
* @return       AvaliacaoComponente with estado, mensagem and last success/error timestamps
*********************************************************************************************************************/
export function avaliarWebsite(e: EstadoComponente | undefined, ativa: boolean, motivo?: string): AvaliacaoComponente {
  if (!ativa) return { estado: 'desativado', mensagem: motivo };
  if (!e || (!e.ultimoSucesso && !e.ultimoErro)) return { estado: 'sem_dados' };
  const base = { ultimoSucesso: e.ultimoSucesso, ultimoErro: e.ultimoErro };
  return t(e.ultimoErro) > t(e.ultimoSucesso) ? { ...base, estado: 'erro', mensagem: e.mensagemErro } : { ...base, estado: 'ok' };
}

/*********************************************************************************************************************
* @method       avaliarBackup
* @description  Evaluates the health of the backup subsystem based on the age of the most recent backup.
*               Returns 'sem_dados' (non-production) or 'degradado' (production) when no backup exists,
*               and 'degradado' when the most recent backup is older than maxIdadeHoras.
* @param        ultimo — timestamp of the most recent backup, or null when none exists
* @param        maxIdadeHoras — maximum acceptable backup age in hours
* @param        producao — whether the system is running in production (affects the no-backup state)
* @param        agora — reference timestamp (default: Date.now())
* @return       AvaliacaoComponente with estado, mensagem and ultimoSucesso timestamp
*********************************************************************************************************************/
export function avaliarBackup(ultimo: Date | null, maxIdadeHoras: number, producao: boolean, agora = Date.now()): AvaliacaoComponente {
  if (!ultimo) return { estado: producao ? 'degradado' : 'sem_dados', mensagem: 'Nenhum backup encontrado' };
  const horas = (agora - ultimo.getTime()) / HORA;
  const base = { ultimoSucesso: ultimo.toISOString() };
  return horas > maxIdadeHoras
    ? { ...base, estado: 'degradado', mensagem: `Último backup há ${Math.floor(horas)} h` }
    : { ...base, estado: 'ok' };
}

/*********************************************************************************************************************
* @method       estadoGlobal
* @description  Computes the overall system health status from the DB connectivity flag and the
*               individual component evaluations. Returns 'down' when the DB is unreachable, 'degraded'
*               when any component is in error or degradado, and 'ok' otherwise.
* @param        db — whether the database connection is healthy
* @param        componentes — array of individual component evaluations
* @return       'ok', 'degraded' or 'down'
*********************************************************************************************************************/
export function estadoGlobal(db: boolean, componentes: AvaliacaoComponente[]): 'ok' | 'degraded' | 'down' {
  if (!db) return 'down';
  return componentes.some(c => c.estado === 'erro' || c.estado === 'degradado') ? 'degraded' : 'ok';
}
