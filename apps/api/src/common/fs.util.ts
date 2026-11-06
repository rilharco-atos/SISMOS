import * as fs from 'fs';

/*********************************************************************************************************************
* @method       apagarFicheiro
* @description  Deletes a file, silently ignoring the error when the file does not exist.
*               Uses unlinkSync instead of fs.rmSync({ force: true }) because rmSync does not
*               delete nor report errors for paths with non-ASCII characters on Node 24 / Windows.
* @param        caminho — absolute or relative path to the file to delete
* @return       void
*********************************************************************************************************************/
export function apagarFicheiro(caminho: string): void {
  try {
    fs.unlinkSync(caminho);
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
}
