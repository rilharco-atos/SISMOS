import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { construirSms, SMS_MAX_CHARS } from '../src/modules/delivery/sms';
import { construirEmailHtml, construirEmailTexto, escapeHtml, CID_LOGO, CID_MAPA } from '../src/modules/delivery/email-template';
import { DocumentoComunicado } from '../src/modules/comunicados/documento';
import { PdfService } from '../src/modules/comunicados/pdf.service';

const base: DocumentoComunicado = {
  referencia: 'SISM-2026-0042', versao: 2, titulo: 'Sismo de magnitude 3.0 — Furnas', texto: 'Primeiro parágrafo.\n\nSegundo <b>parágrafo</b>.',
  templateId: '0002', areaName: 'Açores', eventDateTime: new Date('2026-09-08T16:41:00Z'), magnitude: 3, lat: 37.77, lon: -25.31, depth: 8,
  local: 'a cerca de 4 km a Oeste das Furnas (S. Miguel)', tecnico: 'Maria Cardoso', dataEmissao: new Date('2026-09-08T18:00:00Z'),
};

describe('SMS', () => {
  test('reproduz o exemplo do IPMA', () => {
    assert.equal(
      construirSms(base),
      'Inf. Prelim. Sismo: Acores Data: 2026Set08 16:41 Epicentro: a cerca de 4 km a Oeste das Furnas (S. Miguel) Magnitude: 3.0',
    );
  });

  test('nunca excede 140 caracteres e mantém a magnitude', () => {
    const s = construirSms({ ...base, local: 'a cerca de 40 km a Nor-Noroeste da ilha de São Jorge, entre as ilhas Graciosa e Terceira, no Grupo Central do Arquipélago' });
    assert.ok(s.length <= SMS_MAX_CHARS, `${s.length}`);
    assert.ok(s.endsWith('Magnitude: 3.0'));
    assert.ok(s.includes('...'));
  });

  test('sem acentos nem caracteres especiais', () => {
    assert.match(construirSms({ ...base, local: 'Évora — São Brás' }), /^[\x20-\x7e]+$/);
  });
});

describe('Email HTML', () => {
  test('escapa conteúdo do analista', () => {
    assert.equal(escapeHtml('<script>"&\''), '&lt;script&gt;&quot;&amp;&#39;');
    const html = construirEmailHtml(base, { temLogo: true, temMapa: false });
    assert.ok(html.includes('Segundo &lt;b&gt;parágrafo&lt;/b&gt;.'));
    assert.ok(!html.includes('<b>parágrafo</b>'));
  });

  test('usa CID para logótipo e mapa quando existem', () => {
    const html = construirEmailHtml(base, { temLogo: true, temMapa: true });
    assert.ok(html.includes(`cid:${CID_LOGO}`));
    assert.ok(html.includes(`cid:${CID_MAPA}`));
    const semImagens = construirEmailHtml(base, { temLogo: false, temMapa: false });
    assert.ok(!semImagens.includes('cid:'));
  });

  test('inclui referência, versão 3 dígitos, dados do evento e técnico', () => {
    const html = construirEmailHtml(base, { temLogo: false, temMapa: false });
    assert.ok(html.includes('SISM-2026-0042 · v002'));
    assert.ok(html.includes('08-09-2026 16:41 (hora local)'));
    assert.ok(html.includes('Técnico Responsável: Maria Cardoso'));
    assert.ok(construirEmailTexto(base).includes('Magnitude: 3.0 (Richter)'));
  });
});

describe('PDF', () => {
  test('gera PDF válido com texto longo e caracteres fora do WinAnsi', async () => {
    const bytes = await new PdfService().render({ ...base, texto: 'Linha com emoji 🌍 e símbolo ≥.\n\n' + 'Texto longo. '.repeat(900) });
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
    assert.ok(bytes.length > 2000);
  });
});
