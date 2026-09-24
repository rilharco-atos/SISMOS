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

/** FTP: erro se a última tentativa falhou; degradado se não há sucesso há mais de 5 intervalos. */
export function avaliarFtp(e: EstadoComponente | undefined, configurado: boolean, intervaloMs: number, agora = Date.now()): AvaliacaoComponente {
  if (!configurado) return { estado: 'desativado', mensagem: 'Servidor FTP não configurado' };
  if (!e || (!e.ultimoSucesso && !e.ultimoErro)) return { estado: 'sem_dados', mensagem: 'Ainda sem polling' };
  const base = { ultimoSucesso: e.ultimoSucesso, ultimoErro: e.ultimoErro };
  if (t(e.ultimoErro) > t(e.ultimoSucesso)) return { ...base, estado: 'erro', mensagem: e.mensagemErro };
  if (agora - t(e.ultimoSucesso) > 5 * intervaloMs) return { ...base, estado: 'degradado', mensagem: 'Polling atrasado' };
  return { ...base, estado: 'ok' };
}

/** Envio: degradado se o último envio teve falhas nas últimas 24 h. */
export function avaliarEnvio(e: EstadoComponente | undefined, agora = Date.now()): AvaliacaoComponente {
  if (!e || (!e.ultimoSucesso && !e.ultimoErro)) return { estado: 'sem_dados', mensagem: 'Sem envios desde o arranque' };
  const base = { ultimoSucesso: e.ultimoSucesso, ultimoErro: e.ultimoErro };
  if (t(e.ultimoErro) > t(e.ultimoSucesso) && agora - t(e.ultimoErro) < 24 * HORA) return { ...base, estado: 'degradado', mensagem: e.mensagemErro };
  return { ...base, estado: 'ok' };
}

/** Website: erro se a última operação falhou. */
export function avaliarWebsite(e: EstadoComponente | undefined, ativa: boolean, motivo?: string): AvaliacaoComponente {
  if (!ativa) return { estado: 'desativado', mensagem: motivo };
  if (!e || (!e.ultimoSucesso && !e.ultimoErro)) return { estado: 'sem_dados' };
  const base = { ultimoSucesso: e.ultimoSucesso, ultimoErro: e.ultimoErro };
  return t(e.ultimoErro) > t(e.ultimoSucesso) ? { ...base, estado: 'erro', mensagem: e.mensagemErro } : { ...base, estado: 'ok' };
}

/** Backups: degradado se o mais recente for mais antigo que o limite (ou inexistente em produção). */
export function avaliarBackup(ultimo: Date | null, maxIdadeHoras: number, producao: boolean, agora = Date.now()): AvaliacaoComponente {
  if (!ultimo) return { estado: producao ? 'degradado' : 'sem_dados', mensagem: 'Nenhum backup encontrado' };
  const horas = (agora - ultimo.getTime()) / HORA;
  const base = { ultimoSucesso: ultimo.toISOString() };
  return horas > maxIdadeHoras
    ? { ...base, estado: 'degradado', mensagem: `Último backup há ${Math.floor(horas)} h` }
    : { ...base, estado: 'ok' };
}

/** Estado global: "down" sem base de dados; "degraded" se algum componente está em erro ou degradado. */
export function estadoGlobal(db: boolean, componentes: AvaliacaoComponente[]): 'ok' | 'degraded' | 'down' {
  if (!db) return 'down';
  return componentes.some(c => c.estado === 'erro' || c.estado === 'degradado') ? 'degraded' : 'ok';
}
