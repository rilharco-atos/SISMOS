import { Injectable } from '@nestjs/common';

type Labels = Record<string, string>;
type Tipo = 'counter' | 'gauge';

interface Metrica {
  tipo: Tipo;
  ajuda: string;
  valores: Map<string, { labels: Labels; valor: number }>;
}

export interface EstadoComponente {
  ultimoSucesso?: string;
  ultimoErro?: string;
  mensagemErro?: string;
  detalhe?: Record<string, unknown>;
}

/** Nomes das métricas expostas em /api/metrics. */
export const M = {
  HTTP_PEDIDOS: 'sismos_http_requests_total',
  HTTP_DURACAO_SOMA: 'sismos_http_request_duration_seconds_sum',
  HTTP_DURACAO_CONTAGEM: 'sismos_http_request_duration_seconds_count',
  COMUNICADOS_CRIADOS: 'sismos_comunicados_criados_total',
  ENVIOS: 'sismos_envios_total',
  XML_PROCESSADOS: 'sismos_xml_processados_total',
  FTP_ULTIMO_SUCESSO: 'sismos_ftp_ultimo_poll_sucesso_timestamp_seconds',
  FTP_ERROS: 'sismos_ftp_poll_erros_total',
  WEBSITE: 'sismos_website_operacoes_total',
  ARRANQUE: 'sismos_process_start_time_seconds',
} as const;

const AJUDA: Record<string, [Tipo, string]> = {
  [M.HTTP_PEDIDOS]: ['counter', 'Pedidos HTTP por método e código de resposta'],
  [M.HTTP_DURACAO_SOMA]: ['counter', 'Soma da duração dos pedidos HTTP em segundos'],
  [M.HTTP_DURACAO_CONTAGEM]: ['counter', 'Número de pedidos HTTP medidos'],
  [M.COMUNICADOS_CRIADOS]: ['counter', 'Comunicados criados por origem'],
  [M.ENVIOS]: ['counter', 'Mensagens por canal (email/sms) e resultado (ok/falha)'],
  [M.XML_PROCESSADOS]: ['counter', 'Ficheiros XML do FTP por resultado'],
  [M.FTP_ULTIMO_SUCESSO]: ['gauge', 'Instante (epoch) do último polling FTP sem erro'],
  [M.FTP_ERROS]: ['counter', 'Pollings FTP com erro de ligação'],
  [M.WEBSITE]: ['counter', 'Operações de publicação no website por tipo e resultado'],
  [M.ARRANQUE]: ['gauge', 'Instante (epoch) de arranque do processo'],
};

function chave(labels: Labels): string {
  return Object.keys(labels).sort().map(k => `${k}=${labels[k]}`).join(',');
}

function escaparLabel(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

/**
 * Registo de métricas em memória no formato de exposição Prometheus, e estado dos componentes
 * (FTP, envio, website, backups) usado pelo health check. Os contadores reiniciam com o processo.
 */
@Injectable()
export class MetricsService {
  private metricas = new Map<string, Metrica>();
  private componentes = new Map<string, EstadoComponente>();

  constructor() {
    this.set(M.ARRANQUE, Math.floor(Date.now() / 1000));
  }

  inc(nome: string, labels: Labels = {}, valor = 1): void {
    const m = this.obter(nome, 'counter');
    const k = chave(labels);
    const atual = m.valores.get(k);
    m.valores.set(k, { labels, valor: (atual?.valor ?? 0) + valor });
  }

  set(nome: string, valor: number, labels: Labels = {}): void {
    this.obter(nome, 'gauge').valores.set(chave(labels), { labels, valor });
  }

  valor(nome: string, labels: Labels = {}): number {
    return this.metricas.get(nome)?.valores.get(chave(labels))?.valor ?? 0;
  }

  /** Regista o resultado da última operação de um componente. */
  sucesso(componente: string, detalhe?: Record<string, unknown>): void {
    const e = this.componentes.get(componente) ?? {};
    this.componentes.set(componente, { ...e, ultimoSucesso: new Date().toISOString(), detalhe: detalhe ?? e.detalhe });
  }

  erro(componente: string, mensagem: string, detalhe?: Record<string, unknown>): void {
    const e = this.componentes.get(componente) ?? {};
    this.componentes.set(componente, { ...e, ultimoErro: new Date().toISOString(), mensagemErro: mensagem, detalhe: detalhe ?? e.detalhe });
  }

  estado(componente: string): EstadoComponente | undefined {
    return this.componentes.get(componente);
  }

  /** Texto no formato de exposição Prometheus 0.0.4. */
  render(): string {
    const linhas: string[] = [];
    for (const [nome, m] of [...this.metricas.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      linhas.push(`# HELP ${nome} ${m.ajuda}`, `# TYPE ${nome} ${m.tipo}`);
      for (const { labels, valor } of m.valores.values()) {
        const l = Object.entries(labels).map(([k, v]) => `${k}="${escaparLabel(v)}"`).join(',');
        linhas.push(`${nome}${l ? `{${l}}` : ''} ${valor}`);
      }
    }
    return `${linhas.join('\n')}\n`;
  }

  private obter(nome: string, tipo: Tipo): Metrica {
    let m = this.metricas.get(nome);
    if (!m) {
      const [t, ajuda] = AJUDA[nome] ?? [tipo, nome];
      m = { tipo: t, ajuda, valores: new Map() };
      this.metricas.set(nome, m);
    }
    return m;
  }
}
