import * as fs from 'fs';
import * as path from 'path';

/** Conteúdo publicado no website (título + texto aprovado, como indicado pelo IPMA na entrevista). */
export interface PublicacaoWebsite {
  referencia: string;
  versao: number;
  titulo: string;
  texto: string;
  primeiraPagina: boolean;
  ativo: boolean;
  area: string;
  visivelDe: string | null;
  visivelAte: string | null;
  evento: {
    dataHoraUtc: string | null;
    local: string | null;
    magnitude: number | null;
    latitude: number | null;
    longitude: number | null;
    profundidadeKm: number | null;
    intensidadeMaxima: string | null;
  };
  publicadoEm: string;
}

/** Contrato de integração com o website do IPMA; a implementação concreta depende do protocolo a confirmar. */
export interface WebsitePublisher {
  readonly nome: 'none' | 'http' | 'ficheiro';
  /** true quando há destino configurado. */
  readonly configurado: boolean;
  publicar(p: PublicacaoWebsite): Promise<void>;
  remover(referencia: string): Promise<void>;
}

/** Sem integração configurada: não publica nada. */
export class NoopPublisher implements WebsitePublisher {
  readonly nome = 'none' as const;
  readonly configurado = false;
  async publicar(): Promise<void> { /* sem destino */ }
  async remover(): Promise<void> { /* sem destino */ }
}

/**
 * API HTTP genérica: PUT {base}/comunicados/{referencia} com o JSON da publicação; DELETE para remover.
 * Autenticação opcional por Bearer token.
 */
export class HttpPublisher implements WebsitePublisher {
  readonly nome = 'http' as const;
  readonly configurado: boolean;

  constructor(private baseUrl: string, private token?: string, private timeoutMs = 10000) {
    this.configurado = !!baseUrl;
  }

  async publicar(p: PublicacaoWebsite): Promise<void> {
    await this.pedido('PUT', p.referencia, JSON.stringify(p));
  }

  async remover(referencia: string): Promise<void> {
    await this.pedido('DELETE', referencia);
  }

  private async pedido(method: 'PUT' | 'DELETE', referencia: string, body?: string) {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/comunicados/${encodeURIComponent(referencia)}`;
    const res = await fetch(url, {
      method,
      body,
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (method === 'DELETE' && res.status === 404) return;
    if (!res.ok) throw new Error(`Website respondeu HTTP ${res.status}`);
  }
}

const REFERENCIA_SEGURA = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Pasta partilhada lida pelo website: um JSON por comunicado ({referencia}.json) e um índice
 * (comunicados.json) com os ativos. Escrita atómica (ficheiro temporário + rename).
 */
export class FicheiroPublisher implements WebsitePublisher {
  readonly nome = 'ficheiro' as const;
  readonly configurado: boolean;

  constructor(private dir: string) {
    this.configurado = !!dir;
  }

  async publicar(p: PublicacaoWebsite): Promise<void> {
    this.escrever(`${this.nomeSeguro(p.referencia)}.json`, p);
    this.atualizarIndice(indice => [...indice.filter(i => i.referencia !== p.referencia), p]);
  }

  async remover(referencia: string): Promise<void> {
    fs.rmSync(path.join(this.dir, `${this.nomeSeguro(referencia)}.json`), { force: true });
    this.atualizarIndice(indice => indice.filter(i => i.referencia !== referencia));
  }

  private nomeSeguro(referencia: string): string {
    if (!REFERENCIA_SEGURA.test(referencia)) throw new Error('Referência inválida para nome de ficheiro');
    return referencia;
  }

  private atualizarIndice(fn: (i: PublicacaoWebsite[]) => PublicacaoWebsite[]) {
    const file = path.join(this.dir, 'comunicados.json');
    let atual: PublicacaoWebsite[] = [];
    try { atual = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { atual = []; }
    const novo = fn(Array.isArray(atual) ? atual : []).sort((a, b) => b.publicadoEm.localeCompare(a.publicadoEm));
    this.escrever('comunicados.json', novo);
  }

  private escrever(nome: string, conteudo: unknown) {
    fs.mkdirSync(this.dir, { recursive: true });
    const destino = path.join(this.dir, nome);
    const tmp = `${destino}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(conteudo, null, 2), 'utf-8');
    fs.renameSync(tmp, destino);
  }
}

/** Escolhe a implementação a partir das variáveis de ambiente. */
export function criarPublisher(env: (k: string) => string | undefined): WebsitePublisher {
  switch ((env('WEBSITE_PUBLISHER') ?? 'none').toLowerCase()) {
    case 'http': return new HttpPublisher(env('IPMA_WEBSITE_API_URL') ?? '', env('IPMA_WEBSITE_API_TOKEN'));
    case 'ficheiro': return new FicheiroPublisher(env('WEBSITE_PUBLICACAO_DIR') ?? '');
    default: return new NoopPublisher();
  }
}
