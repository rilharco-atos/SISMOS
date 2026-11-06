/*********************************************************************************************************************
* @method       lerCsv
* @description  RFC 4180-compliant CSV parser that handles quoted fields containing separator characters,
*               doubled quotes and embedded line breaks. Autodetects the separator (semicolon or comma)
*               from the header row. Returns objects indexed by normalised header names.
* @param        conteudo — raw CSV string, optionally prefixed with a UTF-8 BOM (stripped automatically)
* @return       Array of { linha, dados } where linha is the 1-based source line number and dados maps
*               normalised header names to string field values
*********************************************************************************************************************/
export function lerCsv(conteudo: string): { linha: number; dados: Record<string, string> }[] {
  const texto = conteudo.replace(/^﻿/, '');
  const primeira = texto.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';

  const registos: { linha: number; campos: string[] }[] = [];
  let campos: string[] = [];
  let campo = '';
  let aspas = false;
  let linha = 1;
  let inicioRegisto = 1;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else { if (c === '\n') linha++; campo += c; }
      continue;
    }
    if (c === '"' && campo === '') aspas = true;
    else if (c === sep) { campos.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      campos.push(campo); campo = '';
      if (campos.some(x => x.trim() !== '')) registos.push({ linha: inicioRegisto, campos });
      campos = [];
      linha++;
      inicioRegisto = linha;
    } else campo += c;
  }
  if (aspas) throw new Error(`CSV com aspas por fechar (registo na linha ${inicioRegisto})`);
  campos.push(campo);
  if (campos.some(x => x.trim() !== '')) registos.push({ linha: inicioRegisto, campos });

  if (!registos.length) return [];
  const cabecalho = registos[0].campos.map(normalizarCabecalho);
  return registos.slice(1).map(r => ({
    linha: r.linha,
    dados: Object.fromEntries(cabecalho.map((h, i) => [h, (r.campos[i] ?? '').trim()])),
  }));
}

/*********************************************************************************************************************
* @method       normalizarCabecalho
* @description  Normalises a CSV header string to a consistent key format: strips diacritics,
*               trims whitespace, converts to lowercase, and replaces spaces and hyphens with underscores.
* @param        h — raw header cell string
* @return       Normalised string suitable for use as an object property key
*********************************************************************************************************************/
export function normalizarCabecalho(h: string): string {
  return h.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}
