import { DocumentoComunicado, EMISSOR, linhasEvento, subtituloDocumento } from '../comunicados/documento';

export const CID_LOGO = 'ipma-logo';
export const CID_MAPA = 'mapa-intensidades';

const NAVY = '#00005C';
const TEXTO = '#2D3066';
const CINZA = '#6E71A0';
const FUNDO = '#EAF0FA';
const LINHA = '#DCE1EE';
const FONTE = "Raleway, 'Segoe UI', Arial, sans-serif";

/** Escapa texto para inserção segura em HTML. */
export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function paragrafos(texto: string): string {
  return texto
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p style="margin:0 0 12px;font-family:${FONTE};font-size:14px;line-height:1.65;color:${TEXTO};">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Corpo HTML do email, com a mesma estrutura do PDF. Construído em tabelas com estilos inline
 * para ser compatível com Outlook; logótipo e mapa são referenciados por CID (anexos inline).
 */
export function construirEmailHtml(d: DocumentoComunicado, opts: { temLogo: boolean; temMapa: boolean }): string {
  const linhas = linhasEvento(d)
    .map(([k, v]) => `<tr>
      <td style="padding:4px 12px 4px 0;font-family:${FONTE};font-size:13px;font-weight:700;color:${NAVY};white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td>
      <td style="padding:4px 0;font-family:${FONTE};font-size:13px;color:${TEXTO};vertical-align:top;">${escapeHtml(v)}</td>
    </tr>`)
    .join('');

  const logo = opts.temLogo
    ? `<img src="cid:${CID_LOGO}" width="96" alt="IPMA" style="display:block;margin:0 auto;border:0;width:96px;height:auto;">`
    : `<div style="font-family:${FONTE};font-size:26px;font-weight:800;color:${NAVY};text-align:center;">IPMA</div>`;

  const mapa = opts.temMapa
    ? `<tr><td style="padding:8px 32px 0;text-align:center;"><img src="cid:${CID_MAPA}" alt="Mapa de intensidades" width="576" style="display:block;margin:0 auto;border:0;max-width:100%;height:auto;"></td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(d.titulo)}</title></head>
<body style="margin:0;padding:0;background:${FUNDO};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${FUNDO};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:100%;background:#FFFFFF;border:1px solid ${LINHA};border-radius:12px;">
    <tr><td style="padding:28px 32px 8px;">${logo}</td></tr>
    <tr><td style="padding:8px 32px 0;text-align:center;font-family:${FONTE};font-size:18px;font-weight:800;color:${NAVY};letter-spacing:.02em;">${escapeHtml(d.titulo.toUpperCase())}</td></tr>
    <tr><td style="padding:6px 32px 18px;text-align:center;font-family:'JetBrains Mono',Consolas,monospace;font-size:11px;color:${CINZA};">${escapeHtml(subtituloDocumento(d))}</td></tr>
    <tr><td style="padding:0 32px;"><div style="height:1px;background:${LINHA};line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
    <tr><td style="padding:16px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${linhas}</table></td></tr>
    <tr><td style="padding:0 32px;"><div style="height:1px;background:${LINHA};line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
    <tr><td style="padding:20px 32px 8px;">${paragrafos(d.texto)}</td></tr>
    ${mapa}
    <tr><td style="padding:16px 32px 0;"><div style="height:1px;background:${LINHA};line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
    <tr><td style="padding:12px 32px 24px;font-family:${FONTE};font-size:11px;line-height:1.6;color:${CINZA};">
      Emitido por: ${escapeHtml(EMISSOR)}${d.tecnico ? `<br>Técnico Responsável: ${escapeHtml(d.tecnico)}` : ''}<br>
      O comunicado em PDF segue em anexo. · <a href="https://www.ipma.pt" style="color:${NAVY};">www.ipma.pt</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

/** Versão em texto simples (clientes que não mostram HTML). */
export function construirEmailTexto(d: DocumentoComunicado): string {
  return [
    d.titulo.toUpperCase(),
    subtituloDocumento(d),
    '',
    ...linhasEvento(d).map(([k, v]) => `${k}: ${v}`),
    '',
    d.texto,
    '',
    `Emitido por: ${EMISSOR}`,
    ...(d.tecnico ? [`Técnico Responsável: ${d.tecnico}`] : []),
    'O comunicado em PDF segue em anexo. www.ipma.pt',
  ].join('\n');
}
