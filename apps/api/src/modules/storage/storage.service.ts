import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { apagarFicheiro } from '../../common/fs.util';

export type StorageDriver = 'disco' | 'bd';

const CHAVE_VALIDA = /^(pdfs|imagens)\/[A-Za-z0-9._-]{1,128}$/;
const RAIZ_DISCO = path.resolve('uploads');

/*********************************************************************************************************************
* @method       chaveDe
* @description  Normalises a stored file reference to the canonical "pasta/ficheiro" key format.
*               Accepts legacy formats with backslashes or absolute-like paths (e.g.
*               "uploads\pdfs\X.pdf", "/uploads/imagens/x.png") and the new "pdfs/X.pdf" key form.
* @param        ref — raw reference string as stored in the database, or null/undefined
* @return       Canonical key string matching CHAVE_VALIDA, or null when the reference is absent
*               or does not match the expected pattern
*********************************************************************************************************************/
export function chaveDe(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const partes = ref.replace(/\\/g, '/').split('/').filter(Boolean);
  if (partes.length < 2) return null;
  const chave = `${partes[partes.length - 2]}/${partes[partes.length - 1]}`;
  return CHAVE_VALIDA.test(chave) ? chave : null;
}

/*********************************************************************************************************************
* @method       resolverDriver
* @description  Selects the active storage driver. Returns 'bd' when STORAGE_DRIVER is set to 'bd'
*               or 'db', or when the VERCEL environment variable is present (serverless environments
*               have no persistent local disk). Returns 'disco' otherwise.
* @param        env — getter function that returns an environment variable value by key
* @return       StorageDriver: 'bd' for database storage, 'disco' for local filesystem
*********************************************************************************************************************/
export function resolverDriver(env: (k: string) => string | undefined): StorageDriver {
  const v = (env('STORAGE_DRIVER') ?? '').toLowerCase();
  if (v === 'bd' || v === 'db' || env('VERCEL')) return 'bd';
  return 'disco';
}

/***********************************************************************************************************************
* @class         StorageService
* @description   Injectable NestJS service for storing and retrieving PDF bulletins and images.
*                Abstracts over two storage backends: local filesystem (Docker/IPMA on-premises
*                installation) and database BLOB (Vercel and other serverless environments without
*                persistent disk).
*
* @responsibilities
*                 - Save binary content under a validated key of the form "pdfs/X.pdf" or "imagens/X.png"
*                 - Retrieve stored content by key or by a legacy-format reference string
*                 - Delete stored content by key or by a legacy-format reference string
*                 - Select the backend driver from the environment at construction time
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - CHAVE_VALIDA enforces key format to prevent path traversal on the 'disco' driver.
*                 - RAIZ_DISCO is resolved at module load time; the ler() method also checks that
*                   the resolved file path stays inside RAIZ_DISCO before reading.
*                 - The 'bd' driver stores content in the Ficheiro Prisma model.
***********************************************************************************************************************/
@Injectable()
export class StorageService {
  readonly driver: StorageDriver;

  constructor(private prisma: PrismaClient, driver?: StorageDriver) {
    this.driver = driver ?? resolverDriver(k => process.env[k]);
  }

  /*********************************************************************************************************************
  * @method       guardar
  * @description  Saves binary content to the active storage backend under the given key.
  *               On disk, the necessary subdirectory is created if it does not exist.
  *               In the database, the Ficheiro row is upserted.
  * @param        chave — storage key in the form "pdfs/name.pdf" or "imagens/name.png"
  * @param        conteudo — raw binary content as Buffer or Uint8Array
  * @param        contentType — MIME type to store alongside the content (DB driver only)
  * @return       Promise resolving to the key that was stored
  * @uses         PrismaClient.ficheiro.upsert, fs.mkdirSync, fs.writeFileSync
  *********************************************************************************************************************/
  async guardar(chave: string, conteudo: Buffer | Uint8Array, contentType: string): Promise<string> {
    if (!CHAVE_VALIDA.test(chave)) throw new Error(`Chave de ficheiro inválida: ${chave}`);
    const buf = Buffer.from(conteudo);
    if (this.driver === 'bd') {
      await this.prisma.ficheiro.upsert({
        where: { chave },
        create: { chave, conteudo: buf, contentType, tamanho: buf.length },
        update: { conteudo: buf, contentType, tamanho: buf.length },
      });
    } else {
      const destino = path.join(RAIZ_DISCO, chave);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, buf);
    }
    return chave;
  }

  /*********************************************************************************************************************
  * @method       ler
  * @description  Returns the binary content and MIME type for a stored file, or null when not found.
  *               Accepts both canonical keys and legacy-format reference strings via chaveDe().
  *               On the disk driver, verifies the resolved path stays inside RAIZ_DISCO.
  * @param        ref — key or legacy reference string, or null/undefined for absent references
  * @return       Promise resolving to { conteudo, contentType } or null
  * @uses         chaveDe, PrismaClient.ficheiro.findUnique, fs.existsSync, fs.readFileSync
  *********************************************************************************************************************/
  async ler(ref: string | null | undefined): Promise<{ conteudo: Buffer; contentType: string } | null> {
    const chave = chaveDe(ref);
    if (!chave) return null;
    if (this.driver === 'bd') {
      const f = await this.prisma.ficheiro.findUnique({ where: { chave } });
      return f ? { conteudo: Buffer.from(f.conteudo), contentType: f.contentType } : null;
    }
    const origem = path.join(RAIZ_DISCO, chave);
    if (!origem.startsWith(RAIZ_DISCO + path.sep) || !fs.existsSync(origem)) return null;
    return { conteudo: fs.readFileSync(origem), contentType: chave.endsWith('.pdf') ? 'application/pdf' : chave.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  }

  /*********************************************************************************************************************
  * @method       remover
  * @description  Deletes a stored file from the active backend. Silently returns when the reference
  *               is absent or does not match the expected pattern.
  * @param        ref — key or legacy reference string, or null/undefined for absent references
  * @return       Promise resolving to void
  * @uses         chaveDe, PrismaClient.ficheiro.deleteMany, apagarFicheiro
  *********************************************************************************************************************/
  async remover(ref: string | null | undefined): Promise<void> {
    const chave = chaveDe(ref);
    if (!chave) return;
    if (this.driver === 'bd') await this.prisma.ficheiro.deleteMany({ where: { chave } });
    else apagarFicheiro(path.join(RAIZ_DISCO, chave));
  }
}
