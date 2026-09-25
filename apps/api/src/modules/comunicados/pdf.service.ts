import { Injectable, Logger, Optional } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import * as fs from 'fs';
import {
  DocumentoComunicado, EMISSOR, LOGO_PATH, linhasEvento, subtituloDocumento, tipoImagem, versaoLabel,
} from './documento';
import { StorageService } from '../storage/storage.service';

const A4: [number, number] = [595, 842];
const MARGEM = 50;
const NAVY = rgb(0, 0, 0.36);
const TEXTO = rgb(0.16, 0.18, 0.4);
const CINZA = rgb(0.43, 0.44, 0.63);
const LINHA = rgb(0.85, 0.87, 0.93);
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

/** Substitui caracteres fora do WinAnsi (não suportados pelas fontes standard do PDF). */
function winAnsi(s: string): string {
  return s.replace(/[^\n\r\t\x20-\x7e\xa0-\xff]/g, c => (WIN_ANSI_EXTRA.includes(c) ? c : '?'));
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(@Optional() private storage?: StorageService) {}

  /** Gera o PDF do comunicado, guarda-o no armazenamento e devolve a chave ("pdfs/..."). */
  async generate(data: DocumentoComunicado): Promise<string> {
    if (!this.storage) throw new Error('Armazenamento não configurado');
    const bytes = await this.render(data);
    const chave = `pdfs/${data.referencia.replace(/[^A-Za-z0-9-]/g, '_')}_v${versaoLabel(data.versao)}.pdf`;
    return this.storage.guardar(chave, bytes, 'application/pdf');
  }

  /** Desenha o documento A4 (várias páginas se necessário). */
  async render(data: DocumentoComunicado): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setTitle(`${data.referencia} v${versaoLabel(data.versao)} — ${winAnsi(data.titulo)}`);
    doc.setAuthor(EMISSOR);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const mono = await doc.embedFont(StandardFonts.Courier);
    const logo = await this.embedBuffer(doc, fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null, 'logo');
    const mapa = await this.embedBuffer(doc, (await this.storage?.ler(data.imagemUrl))?.conteudo ?? null, 'mapa');

    const [W, H] = A4;
    const largura = W - MARGEM * 2;
    let page = doc.addPage(A4);
    let y = H - MARGEM;

    const novaPagina = () => { page = doc.addPage(A4); y = H - MARGEM; };
    const garantir = (altura: number) => { if (y - altura < MARGEM + 40) novaPagina(); };

    if (logo) {
      const h = 56, w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x: (W - w) / 2, y: y - h, width: w, height: h });
      y -= h + 18;
    }

    for (const linha of this.wrap(winAnsi(data.titulo.toUpperCase()), bold, 15, largura)) {
      this.centrado(page, linha, bold, 15, y, NAVY, W);
      y -= 20;
    }
    this.centrado(page, winAnsi(subtituloDocumento(data)), mono, 8, y, CINZA, W);
    y -= 16;
    page.drawLine({ start: { x: MARGEM, y }, end: { x: W - MARGEM, y }, thickness: 0.6, color: LINHA });
    y -= 20;

    for (const [label, valor] of linhasEvento(data)) {
      const rotulo = winAnsi(`${label}: `);
      const wLabel = bold.widthOfTextAtSize(rotulo, 10);
      const linhas = this.wrap(winAnsi(valor), font, 10, largura - wLabel);
      garantir(15 * linhas.length);
      page.drawText(rotulo, { x: MARGEM, y, size: 10, font: bold, color: NAVY });
      linhas.forEach((l, i) => page.drawText(l, { x: MARGEM + wLabel, y: y - i * 15, size: 10, font, color: TEXTO }));
      y -= 15 * linhas.length;
    }

    y -= 8;
    page.drawLine({ start: { x: MARGEM, y }, end: { x: W - MARGEM, y }, thickness: 0.6, color: LINHA });
    y -= 22;

    for (const paragrafo of winAnsi(data.texto).split(/\n/)) {
      if (!paragrafo.trim()) { y -= 8; continue; }
      for (const linha of this.wrap(paragrafo, font, 10.5, largura)) {
        garantir(15);
        page.drawText(linha, { x: MARGEM, y, size: 10.5, font, color: TEXTO });
        y -= 15;
      }
    }

    if (mapa) {
      const maxW = largura, maxH = 360;
      const escala = Math.min(maxW / mapa.width, maxH / mapa.height, 1);
      const w = mapa.width * escala, h = mapa.height * escala;
      y -= 14;
      garantir(h);
      page.drawImage(mapa, { x: (W - w) / 2, y: y - h, width: w, height: h });
      y -= h + 10;
    }

    garantir(40);
    y -= 10;
    page.drawLine({ start: { x: MARGEM, y }, end: { x: W - MARGEM, y }, thickness: 0.6, color: LINHA });
    y -= 16;
    page.drawText(winAnsi(`Emitido por: ${EMISSOR}`), { x: MARGEM, y, size: 8.5, font, color: CINZA });
    if (data.tecnico) {
      y -= 12;
      page.drawText(winAnsi(`Técnico Responsável: ${data.tecnico}`), { x: MARGEM, y, size: 8.5, font, color: CINZA });
    }

    const paginas = doc.getPages();
    paginas.forEach((p, i) => {
      p.drawText(winAnsi(`${data.referencia} · v${versaoLabel(data.versao)}`), { x: MARGEM, y: 28, size: 7, font: mono, color: CINZA });
      const pag = `www.ipma.pt · ${i + 1}/${paginas.length}`;
      p.drawText(pag, { x: W - MARGEM - font.widthOfTextAtSize(pag, 7), y: 28, size: 7, font, color: NAVY });
    });

    return doc.save();
  }

  private async embedBuffer(doc: PDFDocument, buf: Buffer | null, nome: string): Promise<PDFImage | null> {
    if (!buf) return null;
    try {
      const tipo = tipoImagem(buf);
      if (tipo === 'png') return await doc.embedPng(buf);
      if (tipo === 'jpeg') return await doc.embedJpg(buf);
    } catch (e: any) {
      this.logger.warn(JSON.stringify({ msg: 'Imagem não embebida no PDF', imagem: nome, erro: e.message }));
    }
    return null;
  }

  private centrado(page: PDFPage, texto: string, font: PDFFont, size: number, y: number, color: ReturnType<typeof rgb>, W: number) {
    page.drawText(texto, { x: (W - font.widthOfTextAtSize(texto, size)) / 2, y, size, font, color });
  }

  private wrap(texto: string, font: PDFFont, size: number, max: number): string[] {
    const out: string[] = [];
    let linha = '';
    for (const palavra of texto.split(/\s+/).filter(Boolean)) {
      const tentativa = linha ? `${linha} ${palavra}` : palavra;
      if (font.widthOfTextAtSize(tentativa, size) <= max) { linha = tentativa; continue; }
      if (linha) out.push(linha);
      linha = palavra;
    }
    if (linha) out.push(linha);
    return out.length ? out : [''];
  }
}
