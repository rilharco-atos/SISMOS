import { detect } from 'chardet';
import { decode } from 'iconv-lite';

/*
 * Detecta o charset real de um Buffer XML e devolve a string UTF-8 correcta.
 * Necessário porque os ficheiros do IPMA declaram UTF-8 mas contêm bytes ISO-8859-1.
 */
export function normalizarCharset(raw: Buffer): string {
  const enc = detect(raw) ?? 'utf-8';
  return decode(raw, enc).replace(/^﻿/, '');
}
