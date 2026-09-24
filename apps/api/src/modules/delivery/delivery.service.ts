import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import * as nodemailer from 'nodemailer';
import type { Attachment } from 'nodemailer/lib/mailer';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { ListasService } from '../listas/listas.service';
import { AuditService } from '../audit/audit.service';
import { ComunicadosService } from '../comunicados/comunicados.service';
import { DocumentoComunicado, LOGO_PATH, resolverImagem, tipoImagem, versaoLabel } from '../comunicados/documento';
import { ComunicadoEstado, ListaKey } from '@prisma/client';
import { CID_LOGO, CID_MAPA, construirEmailHtml, construirEmailTexto } from './email-template';
import { construirSms } from './sms';
import { SettingsService } from '../settings/settings.service';
import { SmsSettings, SmtpSettings } from '../settings/settings.resolver';
import { MetricsService, M } from '../observability/metrics.service';
import { WebsiteService } from '../website/website.service';
import { PREFIXO_ASSUNTO_TESTE, chaveEmail, chaveTelefone, elegivel } from './politica-envio';

interface Resultado { enviados: number; falhas: number; ignorados: number; erro?: string }
type Modo = 'test' | 'production';
type Email = ReturnType<DeliveryService['prepararEmail']>;

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private prisma: PrismaService,
    private http: HttpService,
    private listas: ListasService,
    private audit: AuditService,
    private comunicados: ComunicadosService,
    private settings: SettingsService,
    private metrics: MetricsService,
    private website: WebsiteService,
  ) {}

  /**
   * Envia uma versão do comunicado: email (HTML + PDF anexo) às listas de email e SMS às listas de SMS,
   * e publica no website. Um destinatário presente em várias listas recebe apenas uma mensagem.
   * Em modo teste só recebem os contactos marcados como internos.
   */
  async enviarComunicado(comunicadoId: string, versaoId: string, emailListas: ListaKey[], smsListas: ListaKey[], userId: string) {
    if (!emailListas.length && !smsListas.length) throw new BadRequestException('Selecione pelo menos uma lista');
    const comunicado = await this.prisma.comunicado.findUniqueOrThrow({ where: { id: comunicadoId } });
    const versao = await this.prisma.versao.findFirstOrThrow({ where: { id: versaoId, comunicadoId } });
    const [smtp, sms] = await Promise.all([this.settings.smtp(), this.settings.sms()]);
    const modo = sms.modo;
    const documento = await this.documentoDaVersao(comunicado, versao);
    const mensagemSms = construirSms(comunicado as any);

    const emailsEnviados = new Set<string>();
    const telefonesEnviados = new Set<string>();
    const email = emailListas.length ? this.prepararEmail(documento, versao.pdfPath, modo) : null;
    const transporter = emailListas.length ? this.criarTransporter(smtp) : null;
    const total = { emailFalhas: 0, smsFalhas: 0, ignorados: 0 };

    for (const lista of emailListas) {
      const r = await this.enviarEmails(transporter!, smtp, email!, await this.listas.findRawByLista(lista), modo, emailsEnviados);
      total.emailFalhas += r.falhas; total.ignorados += r.ignorados;
      await this.prisma.emailEnvio.create({ data: { versaoId, lista, totalEnviado: r.enviados, totalFalha: r.falhas, sucesso: r.falhas === 0, erro: r.erro } });
    }
    for (const lista of smsListas) {
      const r = await this.enviarSms(sms, mensagemSms, await this.listas.findRawByLista(lista), telefonesEnviados);
      total.smsFalhas += r.falhas; total.ignorados += r.ignorados;
      await this.prisma.smsEnvio.create({ data: { versaoId, lista, mensagem: mensagemSms, totalEnviado: r.enviados, totalFalha: r.falhas, sucesso: r.falhas === 0, erro: r.erro } });
    }

    await this.prisma.comunicado.update({ where: { id: comunicadoId }, data: { estado: ComunicadoEstado.ENVIADO } });
    this.registarEstadoEnvio(comunicado.referencia, total.emailFalhas, total.smsFalhas, emailsEnviados.size, telefonesEnviados.size);
    await this.audit.log({
      userId, acao: 'ENVIAR', entidade: 'Comunicado', entidadeId: comunicadoId, comunicadoId,
      detalhes: {
        versao: versaoLabel(versao.numero), emailListas, smsListas, emails: emailsEnviados.size, sms: telefonesEnviados.size,
        falhasEmail: total.emailFalhas, falhasSms: total.smsFalhas, ignoradosModoTeste: total.ignorados, modo, origemSmtp: smtp.origem,
      },
    });

    const website = await this.website.publicar(comunicadoId, userId, versao.numero);
    return {
      success: total.emailFalhas + total.smsFalhas === 0,
      emails: emailsEnviados.size, sms: telefonesEnviados.size,
      falhas: total.emailFalhas + total.smsFalhas, ignoradosModoTeste: total.ignorados, modo, website,
    };
  }

  /** Pré-visualização do corpo HTML do email (logótipo e mapa servidos como data URI só neste caso). */
  async preVisualizarEmail(comunicadoId: string, versaoId: string): Promise<string> {
    const comunicado = await this.prisma.comunicado.findUniqueOrThrow({ where: { id: comunicadoId } });
    const versao = await this.prisma.versao.findFirstOrThrow({ where: { id: versaoId, comunicadoId } });
    const email = this.prepararEmail(await this.documentoDaVersao(comunicado, versao), versao.pdfPath, (await this.settings.sms()).modo);
    let html = email.html;
    for (const a of email.attachments) {
      if (a.cid && Buffer.isBuffer(a.content)) html = html.replace(`cid:${a.cid}`, `data:${a.contentType};base64,${a.content.toString('base64')}`);
    }
    return html;
  }

  /** Transporte SMTP a partir da configuração efetiva (backoffice ou .env). */
  criarTransporter(smtp: SmtpSettings) {
    return nodemailer.createTransport({
      host: smtp.host, port: smtp.port, secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
      connectionTimeout: 15000,
    });
  }

  private documentoDaVersao(comunicado: any, versao: any): Promise<DocumentoComunicado> {
    return this.comunicados.documento(
      { ...comunicado, titulo: versao.titulo, texto: versao.texto, imagemUrl: versao.imagemUrl ?? comunicado.imagemUrl },
      versao.numero, versao.criadoPorId ?? comunicado.criadoPorId, versao.criadoEm,
    );
  }

  private prepararEmail(documento: DocumentoComunicado, pdfPath: string | null | undefined, modo: Modo) {
    const attachments: Attachment[] = [];
    const logo = this.lerImagem(LOGO_PATH);
    if (logo) attachments.push({ filename: 'ipma-logo.png', content: logo.buf, contentType: logo.mime, cid: CID_LOGO, contentDisposition: 'inline' });
    const mapa = this.lerImagem(resolverImagem(documento.imagemUrl));
    if (mapa) attachments.push({ filename: `mapa-intensidades.${mapa.ext}`, content: mapa.buf, contentType: mapa.mime, cid: CID_MAPA, contentDisposition: 'inline' });

    const pdfAbs = pdfPath ? path.resolve(pdfPath) : null;
    if (pdfAbs && pdfAbs.startsWith(path.resolve('uploads', 'pdfs')) && fs.existsSync(pdfAbs)) {
      attachments.push({ filename: `${documento.referencia}_v${versaoLabel(documento.versao)}.pdf`, content: fs.readFileSync(pdfAbs), contentType: 'application/pdf' });
    } else {
      this.logger.warn(JSON.stringify({ msg: 'PDF da versão não encontrado; email segue sem anexo', referencia: documento.referencia, versao: documento.versao }));
    }

    return {
      subject: `${modo === 'test' ? PREFIXO_ASSUNTO_TESTE : ''}[IPMA] ${documento.titulo} — ${documento.referencia} v${versaoLabel(documento.versao)}`,
      html: construirEmailHtml(documento, { temLogo: !!logo, temMapa: !!mapa }),
      text: construirEmailTexto(documento),
      attachments,
    };
  }

  private lerImagem(file: string | null) {
    if (!file || !fs.existsSync(file)) return null;
    const buf = fs.readFileSync(file);
    const tipo = tipoImagem(buf);
    if (!tipo) return null;
    return { buf, mime: tipo === 'png' ? 'image/png' : 'image/jpeg', ext: tipo === 'png' ? 'png' : 'jpg' };
  }

  private async enviarEmails(transporter: nodemailer.Transporter, smtp: SmtpSettings, email: Email, destinatarios: any[], modo: Modo, jaEnviados: Set<string>): Promise<Resultado> {
    const r: Resultado = { enviados: 0, falhas: 0, ignorados: 0 };
    for (const d of destinatarios) {
      const destino: string | null = d.destinatario.email;
      if (!destino) continue;
      if (!elegivel(d.destinatario, modo)) { r.ignorados++; continue; }
      const chave = chaveEmail(destino);
      if (jaEnviados.has(chave)) continue;
      try {
        await transporter.sendMail({ from: smtp.from, to: destino, ...email });
        jaEnviados.add(chave);
        r.enviados++;
        this.metrics.inc(M.ENVIOS, { canal: 'email', resultado: 'ok' });
      } catch (e: any) {
        r.falhas++;
        r.erro = e.message;
        this.metrics.inc(M.ENVIOS, { canal: 'email', resultado: 'falha' });
        this.logger.error(JSON.stringify({ msg: 'Falha no envio de email', destinatarioId: d.destinatario.id, erro: e.message }));
      }
    }
    return r;
  }

  private async enviarSms(sms: SmsSettings, mensagem: string, destinatarios: any[], jaEnviados: Set<string>): Promise<Resultado> {
    const r: Resultado = { enviados: 0, falhas: 0, ignorados: 0 };
    const comTelefone = destinatarios.filter(d => d.destinatario.telefone);
    if (!sms.providerUrl) {
      if (comTelefone.length) this.logger.error(JSON.stringify({ msg: 'SMS não enviados: SMS_PROVIDER_URL não configurado', destinatarios: comTelefone.length }));
      return { ...r, falhas: comTelefone.length, erro: 'SMS_PROVIDER_URL não configurado' };
    }
    for (const d of comTelefone) {
      if (!elegivel(d.destinatario, sms.modo)) { r.ignorados++; continue; }
      const chave = chaveTelefone(d.destinatario.telefone);
      if (jaEnviados.has(chave)) continue;
      try {
        await firstValueFrom(this.http.post(sms.providerUrl, { apiKey: sms.apiKey, sender: sms.sender, to: d.destinatario.telefone, message: mensagem }, { timeout: 10000 }));
        jaEnviados.add(chave);
        r.enviados++;
        this.metrics.inc(M.ENVIOS, { canal: 'sms', resultado: 'ok' });
      } catch (e: any) {
        r.falhas++;
        r.erro = e.message;
        this.metrics.inc(M.ENVIOS, { canal: 'sms', resultado: 'falha' });
        this.logger.error(JSON.stringify({ msg: 'Falha no envio de SMS', destinatarioId: d.destinatario.id, erro: e.message }));
      }
    }
    return r;
  }

  private registarEstadoEnvio(referencia: string, falhasEmail: number, falhasSms: number, emails: number, sms: number) {
    const detalhe = { referencia, emails, sms, falhasEmail, falhasSms };
    if (falhasEmail + falhasSms > 0) {
      this.metrics.erro('envio', `${falhasEmail + falhasSms} falha(s) no envio de ${referencia}`, detalhe);
      this.logger.error(JSON.stringify({ msg: 'ALERTA: envio com falhas', ...detalhe }));
    } else {
      this.metrics.sucesso('envio', detalhe);
    }
  }
}
