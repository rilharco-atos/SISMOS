import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { apagarFicheiro } from '../../common/fs.util';

export type StorageDriver = 'disco' | 'bd';

const CHAVE_VALIDA = /^(pdfs|imagens)\/[A-Za-z0-9._-]{1,128}$/;
const RAIZ_DISCO = path.resolve('uploads');

/**
 * Normaliza a referência guardada na base de dados para uma chave "pasta/ficheiro".
 * Aceita os formatos antigos ("uploads\pdfs\X.pdf", "/uploads/imagens/x.png") e a chave nova ("pdfs/X.pdf").
 */
export function chaveDe(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const partes = ref.replace(/\\/g, '/').split('/').filter(Boolean);
  if (partes.length < 2) return null;
  const chave = `${partes[partes.length - 2]}/${partes[partes.length - 1]}`;
  return CHAVE_VALIDA.test(chave) ? chave : null;
}

/** Driver ativo: STORAGE_DRIVER explícito; na Vercel (sem disco persistente) é sempre "bd". */
export function resolverDriver(env: (k: string) => string | undefined): StorageDriver {
  const v = (env('STORAGE_DRIVER') ?? '').toLowerCase();
  if (v === 'bd' || v === 'db' || env('VERCEL')) return 'bd';
  return 'disco';
}

/**
 * Armazenamento de PDFs e imagens: disco local (instalação no IPMA / Docker, pasta uploads/)
 * ou base de dados (funções serverless sem disco persistente). As chaves têm a forma "pdfs/X.pdf".
 */
@Injectable()
export class StorageService {
  readonly driver: StorageDriver;

  constructor(private prisma: PrismaClient, driver?: StorageDriver) {
    this.driver = driver ?? resolverDriver(k => process.env[k]);
  }

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

  /** Conteúdo do ficheiro, ou null se não existir. Aceita chaves no formato antigo. */
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

  async remover(ref: string | null | undefined): Promise<void> {
    const chave = chaveDe(ref);
    if (!chave) return;
    if (this.driver === 'bd') await this.prisma.ficheiro.deleteMany({ where: { chave } });
    else apagarFicheiro(path.join(RAIZ_DISCO, chave));
  }
}
