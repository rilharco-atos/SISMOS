/**
 * Leitor de CSV (RFC 4180): campos entre aspas com separadores, aspas duplicadas e quebras de linha.
 * O separador (";" ou ",") é detetado pela linha de cabeçalho. Devolve objetos indexados pelo cabeçalho
 * normalizado (minúsculas, sem acentos, espaços → "_"), com o número da linha de origem.
 */
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

export function normalizarCabecalho(h: string): string {
  return h.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}
