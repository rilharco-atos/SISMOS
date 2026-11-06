import * as fs from 'fs';
import * as path from 'path';
import { apagarFicheiro } from '../../common/fs.util';

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

export interface WebsitePublisher {
  readonly nome: 'none' | 'http' | 'ficheiro';
  readonly configurado: boolean;
  publicar(p: PublicacaoWebsite): Promise<void>;
  remover(referencia: string): Promise<void>;
}

/***********************************************************************************************************************
* @class         NoopPublisher
* @description   No-operation website publisher used when no integration is configured. All publish and
*                remove calls complete immediately without contacting any external system.
*
* @responsibilities
*                 - Implement the WebsitePublisher interface as a safe do-nothing default
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Selected by criarPublisher() when WEBSITE_PUBLISHER is absent or set to 'none'.
***********************************************************************************************************************/
export class NoopPublisher implements WebsitePublisher {
  readonly nome = 'none' as const;
  readonly configurado = false;

  /*********************************************************************************************************************
  * @method       publicar
  * @description  No-operation implementation — does nothing and returns immediately.
  * @return       Resolved void promise
  *********************************************************************************************************************/
  async publicar(): Promise<void> { }

  /*********************************************************************************************************************
  * @method       remover
  * @description  No-operation implementation — does nothing and returns immediately.
  * @return       Resolved void promise
  *********************************************************************************************************************/
  async remover(): Promise<void> { }
}

/***********************************************************************************************************************
* @class         HttpPublisher
* @description   Website publisher that uses a generic HTTP API: PUT {base}/comunicados/{referencia} with
*                the publication JSON payload; DELETE to remove. Supports optional Bearer token authentication.
*
* @responsibilities
*                 - Publish a bulletin by sending a PUT request to the configured API base URL
*                 - Remove a bulletin by sending a DELETE request
*                 - Enforce a configurable timeout on all HTTP requests
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Selected by criarPublisher() when WEBSITE_PUBLISHER=http.
*                 - IPMA_WEBSITE_API_URL and IPMA_WEBSITE_API_TOKEN must be set in the environment.
*
*               Notes for future enhancements:
*                 - Add retry logic for 5xx responses.
***********************************************************************************************************************/
export class HttpPublisher implements WebsitePublisher {
  readonly nome = 'http' as const;
  readonly configurado: boolean;

  /*********************************************************************************************************************
  * @method       constructor
  * @description  Initialises the publisher with the API base URL, optional auth token and request timeout.
  * @param        baseUrl — base URL of the IPMA website API
  * @param        token — optional Bearer authentication token
  * @param        timeoutMs — request timeout in milliseconds (default 10 000)
  *********************************************************************************************************************/
  constructor(private baseUrl: string, private token?: string, private timeoutMs = 10000) {
    this.configurado = !!baseUrl;
  }

  /*********************************************************************************************************************
  * @method       publicar
  * @description  Publishes a bulletin by sending a PUT request with the full publication payload as JSON.
  * @param        p — publication payload including referencia, titulo, texto and evento data
  * @return       Resolved void promise
  *********************************************************************************************************************/
  async publicar(p: PublicacaoWebsite): Promise<void> {
    await this.pedido('PUT', p.referencia, JSON.stringify(p));
  }

  /*********************************************************************************************************************
  * @method       remover
  * @description  Removes a bulletin by sending a DELETE request. Treats 404 as success (already removed).
  * @param        referencia — bulletin reference identifier
  * @return       Resolved void promise
  *********************************************************************************************************************/
  async remover(referencia: string): Promise<void> {
    await this.pedido('DELETE', referencia);
  }

  /*********************************************************************************************************************
  * @method       pedido
  * @description  Sends a PUT or DELETE HTTP request to the website API for the given bulletin reference.
  *               Throws an Error if the response status is not ok (except 404 on DELETE).
  * @param        method — HTTP method: PUT or DELETE
  * @param        referencia — bulletin reference used to build the URL path
  * @param        body — optional request body (JSON string for PUT requests)
  *********************************************************************************************************************/
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

/***********************************************************************************************************************
* @class         FicheiroPublisher
* @description   Website publisher that writes publication data to a shared filesystem directory read by
*                the website. Each bulletin is stored as {referencia}.json; a comunicados.json index lists
*                all active bulletins. Writes are atomic using a temp file and rename.
*
* @responsibilities
*                 - Write individual bulletin JSON files to the configured publication directory
*                 - Maintain a sorted comunicados.json index of active bulletins
*                 - Remove individual bulletin files and update the index on removal
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Selected by criarPublisher() when WEBSITE_PUBLISHER=ficheiro.
*                 - WEBSITE_PUBLICACAO_DIR must point to a directory the website server can read.
*                 - Atomic writes (tmp + rename) prevent partial reads by the website.
*
*               Notes for future enhancements:
*                 - Add file locking for high-concurrency environments.
***********************************************************************************************************************/
export class FicheiroPublisher implements WebsitePublisher {
  readonly nome = 'ficheiro' as const;
  readonly configurado: boolean;

  /*********************************************************************************************************************
  * @method       constructor
  * @description  Initialises the publisher with the target publication directory path.
  * @param        dir — absolute path to the publication directory
  *********************************************************************************************************************/
  constructor(private dir: string) {
    this.configurado = !!dir;
  }

  /*********************************************************************************************************************
  * @method       publicar
  * @description  Writes the bulletin as {referencia}.json and updates the comunicados.json index to
  *               include or replace this entry, sorted by publicadoEm descending.
  * @param        p — publication payload
  * @return       Resolved void promise
  *********************************************************************************************************************/
  async publicar(p: PublicacaoWebsite): Promise<void> {
    this.escrever(`${this.nomeSeguro(p.referencia)}.json`, p);
    this.atualizarIndice(indice => [...indice.filter(i => i.referencia !== p.referencia), p]);
  }

  /*********************************************************************************************************************
  * @method       remover
  * @description  Deletes the bulletin JSON file and removes the entry from the comunicados.json index.
  * @param        referencia — bulletin reference identifier
  * @return       Resolved void promise
  *********************************************************************************************************************/
  async remover(referencia: string): Promise<void> {
    apagarFicheiro(path.join(this.dir, `${this.nomeSeguro(referencia)}.json`));
    this.atualizarIndice(indice => indice.filter(i => i.referencia !== referencia));
  }

  /*********************************************************************************************************************
  * @method       nomeSeguro
  * @description  Validates the bulletin reference against the safe filename pattern to prevent path
  *               traversal. Throws if the reference contains characters outside the allowed set.
  * @param        referencia — bulletin reference to validate
  * @return       The validated reference, safe to use as a filesystem filename
  *********************************************************************************************************************/
  private nomeSeguro(referencia: string): string {
    if (!REFERENCIA_SEGURA.test(referencia)) throw new Error('Referência inválida para nome de ficheiro');
    return referencia;
  }

  /*********************************************************************************************************************
  * @method       atualizarIndice
  * @description  Reads the current comunicados.json index, applies the provided transformation function
  *               and writes the result sorted by publicadoEm descending.
  * @param        fn — function that receives the current index array and returns the updated array
  *********************************************************************************************************************/
  private atualizarIndice(fn: (i: PublicacaoWebsite[]) => PublicacaoWebsite[]) {
    const file = path.join(this.dir, 'comunicados.json');
    let atual: PublicacaoWebsite[] = [];
    try { atual = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { atual = []; }
    const novo = fn(Array.isArray(atual) ? atual : []).sort((a, b) => b.publicadoEm.localeCompare(a.publicadoEm));
    this.escrever('comunicados.json', novo);
  }

  /*********************************************************************************************************************
  * @method       escrever
  * @description  Atomically writes serialised JSON content to a file in the publication directory by
  *               writing to a temp file first and then renaming, preventing partial reads.
  * @param        nome — destination filename relative to the publication directory
  * @param        conteudo — data to serialise as formatted JSON
  *********************************************************************************************************************/
  private escrever(nome: string, conteudo: unknown) {
    fs.mkdirSync(this.dir, { recursive: true });
    const destino = path.join(this.dir, nome);
    const tmp = `${destino}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(conteudo, null, 2), 'utf-8');
    fs.renameSync(tmp, destino);
  }
}

/***********************************************************************************************************************
* @method       criarPublisher
* @description  Factory function that selects and instantiates the correct WebsitePublisher implementation
*               based on the WEBSITE_PUBLISHER environment variable. Returns NoopPublisher when the variable
*               is absent or set to any value other than 'http' or 'ficheiro'.
* @param        env — function that returns an environment variable value by name
* @return       Configured WebsitePublisher instance ready to use
* @uses         NoopPublisher, HttpPublisher, FicheiroPublisher
***********************************************************************************************************************/
export function criarPublisher(env: (k: string) => string | undefined): WebsitePublisher {
  switch ((env('WEBSITE_PUBLISHER') ?? 'none').toLowerCase()) {
    case 'http': return new HttpPublisher(env('IPMA_WEBSITE_API_URL') ?? '', env('IPMA_WEBSITE_API_TOKEN'));
    case 'ficheiro': return new FicheiroPublisher(env('WEBSITE_PUBLICACAO_DIR') ?? '');
    default: return new NoopPublisher();
  }
}
