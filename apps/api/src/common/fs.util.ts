import * as fs from 'fs';

/**
 * Apaga um ficheiro, ignorando se não existir. Usa unlinkSync porque fs.rmSync({ force: true })
 * não apaga nem dá erro em caminhos com caracteres não-ASCII no Node 24 em Windows.
 */
export function apagarFicheiro(caminho: string): void {
  try {
    fs.unlinkSync(caminho);
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
}
