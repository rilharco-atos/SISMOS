import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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

export const M = {
  HTTP_PEDIDOS: 'sismos_http_requests_total',
  HTTP_DURACAO_SOMA: 'sismos_http_request_duration_seconds_sum',
  HTTP_DURACAO_CONTAGEM: 'sismos_http_request_duration_seconds_count',
  COMUNICADOS_CRIADOS: 'sismos_comunicados_criados_total',
  ENVIOS: 'sismos_envios_total',
  XML_PROCESSADOS: 'sismos_xml_processados_total',
  XML_LATENCIA_SOMA: 'sismos_xml_para_envio_latencia_seconds_sum',
  XML_LATENCIA_CONTAGEM: 'sismos_xml_para_envio_latencia_seconds_count',
  XML_SEM_LISTA: 'sismos_xml_sem_lista_destino_total',
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
  [M.XML_LATENCIA_SOMA]: ['counter', 'Soma da latência entre download do XML e despacho da notificação, em segundos'],
  [M.XML_LATENCIA_CONTAGEM]: ['counter', 'Número de envios automáticos com latência medida'],
  [M.XML_SEM_LISTA]: ['counter', 'Ficheiros XML retidos por ausência de lista de distribuição (smsKey/emailKey vazio)'],
  [M.WEBSITE]: ['counter', 'Operações de publicação no website por tipo e resultado'],
  [M.ARRANQUE]: ['gauge', 'Instante (epoch) de arranque do processo'],
};

function chave(labels: Labels): string {
  return Object.keys(labels).sort().map(k => `${k}=${labels[k]}`).join(',');
}

function escaparLabel(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

/***********************************************************************************************************************
* @class         MetricsService
* @description   Injectable NestJS service that maintains in-memory Prometheus-format counters and
*                gauges, and persists component health state (FTP, envio, website, backup) to the
*                database so that the health check is consistent across multiple process instances.
*
* @responsibilities
*                 - Increment counters and set gauge values for HTTP, envio, FTP and website metrics
*                 - Record per-component last-success and last-error timestamps in memory and the DB
*                 - Provide estadoPartilhado() that reads from the DB with in-memory fallback
*                 - Render all metrics as a Prometheus text exposition format 0.0.4 string
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Counters reset with the process (in-memory only). Gauges for component health
*                   are persisted to EstadoComponente rows so they survive restarts.
*                 - PrismaService is optional so that MetricsService can be used in unit tests
*                   without a real DB. When absent, estadoPartilhado() falls back to in-memory state.
*                 - persistir() swallows DB errors with a warn log so that a DB outage never
*                   breaks the application's hot path.
***********************************************************************************************************************/
@Injectable()
export class MetricsService {
  private metricas = new Map<string, Metrica>();
  private componentes = new Map<string, EstadoComponente>();

  private readonly logger = new Logger(MetricsService.name);

  constructor(@Optional() private prisma?: PrismaService) {
    this.set(M.ARRANQUE, Math.floor(Date.now() / 1000));
  }

  /*********************************************************************************************************************
  * @method       inc
  * @description  Increments a named counter by the given value (default 1), creating it on first use.
  * @param        nome — metric name; must be in the AJUDA registry to get the correct type and help text
  * @param        labels — optional label set; the label key order does not matter
  * @param        valor — increment amount (default 1)
  * @return       void
  * @uses         MetricsService.obter
  *********************************************************************************************************************/
  inc(nome: string, labels: Labels = {}, valor = 1): void {
    const m = this.obter(nome, 'counter');
    const k = chave(labels);
    const atual = m.valores.get(k);
    m.valores.set(k, { labels, valor: (atual?.valor ?? 0) + valor });
  }

  /*********************************************************************************************************************
  * @method       set
  * @description  Sets a named gauge to the given value, creating it on first use.
  * @param        nome — metric name
  * @param        valor — value to set
  * @param        labels — optional label set
  * @return       void
  * @uses         MetricsService.obter
  *********************************************************************************************************************/
  set(nome: string, valor: number, labels: Labels = {}): void {
    this.obter(nome, 'gauge').valores.set(chave(labels), { labels, valor });
  }

  /*********************************************************************************************************************
  * @method       valor
  * @description  Returns the current value of a metric for a given label set, or 0 when absent.
  * @param        nome — metric name
  * @param        labels — optional label set
  * @return       Current numeric value
  *********************************************************************************************************************/
  valor(nome: string, labels: Labels = {}): number {
    return this.metricas.get(nome)?.valores.get(chave(labels))?.valor ?? 0;
  }

  /*********************************************************************************************************************
  * @method       sucesso
  * @description  Records a successful operation for a named component: updates the in-memory state
  *               and upserts the EstadoComponente DB row with the current timestamp.
  * @param        componente — component identifier (e.g. 'ftp', 'envio', 'website')
  * @param        detalhe — optional structured details to store alongside the timestamp
  * @return       void
  * @uses         MetricsService.persistir
  *********************************************************************************************************************/
  sucesso(componente: string, detalhe?: Record<string, unknown>): void {
    const e = this.componentes.get(componente) ?? {};
    const agora = new Date();
    this.componentes.set(componente, { ...e, ultimoSucesso: agora.toISOString(), detalhe: detalhe ?? e.detalhe });
    this.persistir(componente, { ultimoSucesso: agora, ...(detalhe ? { detalhe: detalhe as any } : {}) });
  }

  /*********************************************************************************************************************
  * @method       erro
  * @description  Records a failed operation for a named component: updates the in-memory state
  *               and upserts the EstadoComponente DB row with the error message and timestamp.
  * @param        componente — component identifier
  * @param        mensagem — error message string (truncated to 500 chars when persisted)
  * @param        detalhe — optional structured details
  * @return       void
  * @uses         MetricsService.persistir
  *********************************************************************************************************************/
  erro(componente: string, mensagem: string, detalhe?: Record<string, unknown>): void {
    const e = this.componentes.get(componente) ?? {};
    const agora = new Date();
    this.componentes.set(componente, { ...e, ultimoErro: agora.toISOString(), mensagemErro: mensagem, detalhe: detalhe ?? e.detalhe });
    this.persistir(componente, { ultimoErro: agora, mensagemErro: mensagem.slice(0, 500), ...(detalhe ? { detalhe: detalhe as any } : {}) });
  }

  /*********************************************************************************************************************
  * @method       estado
  * @description  Returns the in-memory component state for the given component identifier.
  * @param        componente — component identifier
  * @return       EstadoComponente or undefined when no state has been recorded yet
  *********************************************************************************************************************/
  estado(componente: string): EstadoComponente | undefined {
    return this.componentes.get(componente);
  }

  /*********************************************************************************************************************
  * @method       estadoPartilhado
  * @description  Returns the component state from the EstadoComponente DB row so that the health
  *               check is consistent across multiple process instances. Falls back to in-memory
  *               state when the DB is unavailable or when PrismaService was not injected.
  * @param        componente — component identifier
  * @return       Promise resolving to EstadoComponente or undefined
  * @uses         PrismaService.estadoComponente.findUnique, MetricsService.estado
  *********************************************************************************************************************/
  async estadoPartilhado(componente: string): Promise<EstadoComponente | undefined> {
    if (!this.prisma) return this.estado(componente);
    try {
      const r = await this.prisma.estadoComponente.findUnique({ where: { componente } });
      if (!r) return this.estado(componente);
      return {
        ultimoSucesso: r.ultimoSucesso?.toISOString(), ultimoErro: r.ultimoErro?.toISOString(),
        mensagemErro: r.mensagemErro ?? undefined, detalhe: (r.detalhe as Record<string, unknown>) ?? undefined,
      };
    } catch {
      return this.estado(componente);
    }
  }

  private persistir(componente: string, dados: Record<string, unknown>) {
    if (!this.prisma) return;
    this.prisma.estadoComponente
      .upsert({ where: { componente }, create: { componente, ...dados }, update: dados })
      .catch((e: Error) => this.logger.warn(JSON.stringify({ msg: 'Estado do componente não persistido', componente, erro: e.message })));
  }

  /*********************************************************************************************************************
  * @method       render
  * @description  Serialises all registered metrics to Prometheus text exposition format 0.0.4,
  *               with HELP and TYPE lines before each metric family, sorted alphabetically.
  * @return       Prometheus text string ending with a newline
  *********************************************************************************************************************/
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
