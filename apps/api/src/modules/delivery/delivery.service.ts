import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import * as nodemailer from 'nodemailer';
import type { Attachment } from 'nodemailer/lib/mailer';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import { PrismaService } from '../../prisma/prisma.service';
import { ListasService } from '../listas/listas.service';
import { AuditService } from '../audit/audit.service';
import { ComunicadosService } from '../comunicados/comunicados.service';
import { DocumentoComunicado, LOGO_PATH, tipoImagem, versaoLabel } from '../comunicados/documento';
import { StorageService } from '../storage/storage.service';
import { ComunicadoEstado, ListaKey } from '@prisma/client';
import { CID_LOGO, CID_MAPA, construirEmailHtml, construirEmailTexto } from './email-template';
import { construirSms } from './sms';
import { SettingsService } from '../settings/settings.service';
import { SmsSettings, SmtpSettings } from '../settings/settings.resolver';
import { MetricsService, M } from '../observability/metrics.service';
import { WebsiteService } from '../website/website.service';
import { PREFIXO_ASSUNTO_TESTE, chaveEmail, chaveTelefone, elegivel } from './politica-envio';
import { TransporteEmail, TransporteResend, TransporteSendgrid, embutirImagens } from './email-http';

interface Resultado { enviados: number; falhas: number; ignorados: number; erro?: string }
type Modo = 'test' | 'production';
type Email = Awaited<ReturnType<DeliveryService['prepararEmail']>>;

/***********************************************************************************************************************
* @class         DeliveryService
* @description   Injectable NestJS service that orchestrates bulletin dispatch: email (HTML + PDF
*                attachment) to email lists, SMS to SMS lists, and publication to the IPMA website.
*
* @responsibilities
*                 - Build the email message with logo, intensity map and PDF attachment
*                 - Dispatch to multiple email lists with per-address deduplication
*                 - Dispatch SMS messages to phone lists with per-number deduplication
*                 - Publish the bulletin to the configured website integration
*                 - Persist email and SMS delivery records and write to the audit log
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - In test mode (sms.modo='test') only contacts marked internal receive messages.
*                 - Email transport is selected dynamically: SendGrid, Resend or SMTP nodemailer.
*                 - All metrics are recorded via MetricsService for observability.
*
*               Notes for future enhancements:
*                 - Add retry logic for transient transport failures.
***********************************************************************************************************************/
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
    private storage: StorageService,
  ) {}

  /*********************************************************************************************************************
  * @method       enviarComunicado
  * @description  Dispatches a bulletin version to email and SMS lists, then publishes it to the website.
  *               A recipient present in multiple lists receives only one message. In test mode only
  *               internal contacts receive messages.
  * @param        comunicadoId — bulletin UUID
  * @param        versaoId — version UUID
  * @param        emailListas — list keys for email dispatch
  * @param        smsListas — list keys for SMS dispatch
  * @param        userId — authenticated user id for audit logging
  * @return       Result object with email/SMS counts, failure counts, mode and website publication status
  * @uses         DeliveryService.prepararEmail, DeliveryService.enviarEmails, DeliveryService.enviarSms, WebsiteService.publicar
  *********************************************************************************************************************/
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
    const email = emailListas.length ? await this.prepararEmail(documento, versao.pdfPath, modo) : null;
    const transporter = emailListas.length ? this.criarTransporter(smtp) : null;
    const total = { emailFalhas: 0, smsFalhas: 0, ignorados: 0 };

    for (const lista of emailListas) {
      const r = await this.enviarEmails(transporter!, smtp, email!, await this.listas.findRawByLista(lista), modo, emailsEnviados, sms.simulado);
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
        falhasEmail: total.emailFalhas, falhasSms: total.smsFalhas, ignoradosModoTeste: total.ignorados, modo, simulado: sms.simulado, origemSmtp: smtp.origem,
      },
    });

    const website = await this.website.publicar(comunicadoId, userId, versao.numero);
    return {
      success: total.emailFalhas + total.smsFalhas === 0,
      emails: emailsEnviados.size, sms: telefonesEnviados.size,
      falhas: total.emailFalhas + total.smsFalhas, ignoradosModoTeste: total.ignorados, modo, simulado: sms.simulado, website,
    };
  }

  /*********************************************************************************************************************
  * @method       preVisualizarEmail
  * @description  Returns the HTML body of the bulletin email with all inline images embedded as data
  *               URIs, suitable for browser preview without an email client.
  * @param        comunicadoId — bulletin UUID
  * @param        versaoId — version UUID
  * @return       HTML string with logo and intensity map embedded as base64 data URIs
  * @uses         DeliveryService.prepararEmail, embutirImagens
  *********************************************************************************************************************/
  async preVisualizarEmail(comunicadoId: string, versaoId: string): Promise<string> {
    const comunicado = await this.prisma.comunicado.findUniqueOrThrow({ where: { id: comunicadoId } });
    const versao = await this.prisma.versao.findFirstOrThrow({ where: { id: versaoId, comunicadoId } });
    const email = await this.prepararEmail(await this.documentoDaVersao(comunicado, versao), versao.pdfPath, (await this.settings.sms()).modo);
    return embutirImagens(email.html, email.attachments);
  }

  /*********************************************************************************************************************
  * @method       criarTransporter
  * @description  Creates the email transport from the effective configuration. Uses SendGrid when
  *               apiProvedor is 'sendgrid', Resend when it is 'resend', and SMTP nodemailer otherwise.
  * @param        smtp — SmtpSettings with provider, API key, host, port, secure and credentials
  * @return       TransporteEmail instance ready to call sendMail
  * @uses         TransporteSendgrid, TransporteResend, nodemailer.createTransport
  *********************************************************************************************************************/
  criarTransporter(smtp: SmtpSettings): TransporteEmail {
    if (smtp.apiProvedor === 'sendgrid') return new TransporteSendgrid(this.http, smtp.apiKey);
    if (smtp.apiProvedor === 'resend') return new TransporteResend(this.http, smtp.apiKey);
    return nodemailer.createTransport({
      host: smtp.host, port: smtp.port, secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
      connectionTimeout: 15000,
    });
  }

  /*********************************************************************************************************************
  * @method       documentoDaVersao
  * @description  Builds a DocumentoComunicado for a specific bulletin version, merging version-level
  *               fields (titulo, texto, imagemUrl) over the base bulletin record.
  * @param        comunicado — raw Prisma bulletin record
  * @param        versao — raw Prisma version record
  * @return       Promise resolving to the DocumentoComunicado for this version
  * @uses         ComunicadosService.documento
  *********************************************************************************************************************/
  private documentoDaVersao(comunicado: any, versao: any): Promise<DocumentoComunicado> {
    return this.comunicados.documento(
      { ...comunicado, titulo: versao.titulo, texto: versao.texto, imagemUrl: versao.imagemUrl ?? comunicado.imagemUrl },
      versao.numero, versao.criadoPorId ?? comunicado.criadoPorId, versao.criadoEm,
    );
  }

  /*********************************************************************************************************************
  * @method       prepararEmail
  * @description  Assembles the complete email message object with subject, HTML body, plain-text body
  *               and attachments (logo, intensity map, PDF). Missing files are logged and omitted.
  * @param        documento — DocumentoComunicado with all bulletin content
  * @param        pdfPath — storage path of the PDF attachment, may be null
  * @param        modo — dispatch mode used to prepend [TESTE] to the subject when in test mode
  * @return       Object with subject, html, text and attachments array
  * @uses         construirEmailHtml, construirEmailTexto, StorageService.ler
  *********************************************************************************************************************/
  private async prepararEmail(documento: DocumentoComunicado, pdfPath: string | null | undefined, modo: Modo) {
    const attachments: Attachment[] = [];
    const logo = this.imagem(fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null);
    if (logo) attachments.push({ filename: 'ipma-logo.png', content: logo.buf, contentType: logo.mime, cid: CID_LOGO, contentDisposition: 'inline' });
    const mapa = this.imagem((await this.storage.ler(documento.imagemUrl))?.conteudo ?? null);
    if (mapa) attachments.push({ filename: `mapa-intensidades.${mapa.ext}`, content: mapa.buf, contentType: mapa.mime, cid: CID_MAPA, contentDisposition: 'inline' });

    const pdf = await this.storage.ler(pdfPath);
    if (pdf) {
      attachments.push({ filename: `${documento.referencia}_v${versaoLabel(documento.versao)}.pdf`, content: pdf.conteudo, contentType: 'application/pdf' });
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

  /*********************************************************************************************************************
  * @method       imagem
  * @description  Detects the image type of a Buffer and returns type metadata. Returns null when the
  *               buffer is null or has an unrecognised format.
  * @param        buf — raw image buffer or null
  * @return       Object with buf, mime type string and file extension, or null
  * @uses         tipoImagem
  *********************************************************************************************************************/
  private imagem(buf: Buffer | null) {
    if (!buf) return null;
    const tipo = tipoImagem(buf);
    if (!tipo) return null;
    return { buf, mime: tipo === 'png' ? 'image/png' : 'image/jpeg', ext: tipo === 'png' ? 'png' : 'jpg' };
  }

  /*********************************************************************************************************************
  * @method       enviarEmails
  * @description  Iterates recipients from a single list and sends the email to each eligible address
  *               not already dispatched. Records metrics and logs failures per recipient.
  * @param        transporter — TransporteEmail instance to use for sending
  * @param        smtp — SmtpSettings providing the from address
  * @param        email — prepared Email object with subject, html, text and attachments
  * @param        destinatarios — raw list-recipient records from the database
  * @param        modo — dispatch mode for eligibility filtering
  * @param        jaEnviados — deduplication set of already-sent email keys (mutated)
  * @param        simulado — when true, logs instead of sending
  * @return       Resultado with enviados, falhas and ignorados counts
  * @uses         elegivel, chaveEmail, TransporteEmail.sendMail, MetricsService.inc
  *********************************************************************************************************************/
  private async enviarEmails(transporter: TransporteEmail, smtp: SmtpSettings, email: Email, destinatarios: any[], modo: Modo, jaEnviados: Set<string>, simulado: boolean): Promise<Resultado> {
    const r: Resultado = { enviados: 0, falhas: 0, ignorados: 0 };
    for (const d of destinatarios) {
      const destino: string | null = d.destinatario.email;
      if (!destino) continue;
      if (!elegivel(d.destinatario, modo)) { r.ignorados++; continue; }
      const chave = chaveEmail(destino);
      if (jaEnviados.has(chave)) continue;
      try {
        if (simulado) {
          this.logger.log(JSON.stringify({ msg: 'Email simulado', destinatarioId: d.destinatario.id, assunto: email.subject }));
        } else {
          await transporter.sendMail({ from: smtp.from, to: destino, ...email });
        }
        jaEnviados.add(chave);
        r.enviados++;
        this.metrics.inc(M.ENVIOS, { canal: 'email', resultado: simulado ? 'simulado' : 'ok' });
      } catch (e: any) {
        r.falhas++;
        r.erro = this.erroFornecedor(e);
        this.metrics.inc(M.ENVIOS, { canal: 'email', resultado: 'falha' });
        this.logger.error(JSON.stringify({ msg: 'Falha no envio de email', destinatarioId: d.destinatario.id, erro: r.erro }));
      }
    }
    return r;
  }

  /*********************************************************************************************************************
  * @method       erroFornecedor
  * @description  Extracts a meaningful error description from an axios error. The axios message only
  *               carries the HTTP status code; the provider's reason is in the response body.
  * @param        e — thrown error object, typically an axios error with optional response.data
  * @return       Human-readable error string capped at 500 characters of response body
  *********************************************************************************************************************/
  private erroFornecedor(e: any): string {
    const dados = e?.response?.data;
    if (dados == null) return e?.message ?? 'erro desconhecido';
    const texto = typeof dados === 'string' ? dados : JSON.stringify(dados);
    return `${e.message} — ${texto.slice(0, 500)}`;
  }

  /*********************************************************************************************************************
  * @method       pedidoSms
  * @description  Sends a single SMS via the configured provider. Supports the generic SMSExpress MEO
  *               format (JSON POST) and Twilio (form-encoded with Basic auth).
  * @param        sms — SmsSettings with format, providerUrl, sender, apiUser and apiKey
  * @param        to — destination phone number in E.164 format
  * @param        mensagem — ASCII SMS message string of at most 140 characters
  * @uses         HttpService.post
  *********************************************************************************************************************/
  private async pedidoSms(sms: SmsSettings, to: string, mensagem: string): Promise<void> {
    if (sms.formato === 'twilio') {
      const corpo = new URLSearchParams({ To: to, From: sms.sender, Body: mensagem });
      await firstValueFrom(this.http.post(sms.providerUrl, corpo.toString(), {
        auth: { username: sms.apiUser, password: sms.apiKey },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      }));
      return;
    }
    await firstValueFrom(this.http.post(
      sms.providerUrl,
      { apiKey: sms.apiKey, sender: sms.sender, to, message: mensagem },
      { timeout: 10000 },
    ));
  }

  /*********************************************************************************************************************
  * @method       enviarSms
  * @description  Iterates recipients from a single list and sends the SMS to each eligible phone number
  *               not already dispatched. Records metrics and logs failures per recipient.
  * @param        sms — SmsSettings with mode, providerUrl and simulado flag
  * @param        mensagem — SMS message string to send
  * @param        destinatarios — raw list-recipient records from the database
  * @param        jaEnviados — deduplication set of already-sent phone keys (mutated)
  * @return       Resultado with enviados, falhas and ignorados counts
  * @uses         elegivel, chaveTelefone, DeliveryService.pedidoSms, MetricsService.inc
  *********************************************************************************************************************/
  private async enviarSms(sms: SmsSettings, mensagem: string, destinatarios: any[], jaEnviados: Set<string>): Promise<Resultado> {
    const r: Resultado = { enviados: 0, falhas: 0, ignorados: 0 };
    const comTelefone = destinatarios.filter(d => d.destinatario.telefone);
    if (!sms.providerUrl && !sms.simulado) {
      if (comTelefone.length) this.logger.error(JSON.stringify({ msg: 'SMS não enviados: SMS_PROVIDER_URL não configurado', destinatarios: comTelefone.length }));
      return { ...r, falhas: comTelefone.length, erro: 'SMS_PROVIDER_URL não configurado' };
    }
    for (const d of comTelefone) {
      if (!elegivel(d.destinatario, sms.modo)) { r.ignorados++; continue; }
      const chave = chaveTelefone(d.destinatario.telefone);
      if (jaEnviados.has(chave)) continue;
      try {
        if (sms.simulado) {
          this.logger.log(JSON.stringify({ msg: 'SMS simulado', destinatarioId: d.destinatario.id, caracteres: mensagem.length, mensagem }));
        } else {
          await this.pedidoSms(sms, d.destinatario.telefone, mensagem);
        }
        jaEnviados.add(chave);
        r.enviados++;
        this.metrics.inc(M.ENVIOS, { canal: 'sms', resultado: sms.simulado ? 'simulado' : 'ok' });
      } catch (e: any) {
        r.falhas++;
        r.erro = this.erroFornecedor(e);
        this.metrics.inc(M.ENVIOS, { canal: 'sms', resultado: 'falha' });
        this.logger.error(JSON.stringify({ msg: 'Falha no envio de SMS', destinatarioId: d.destinatario.id, erro: r.erro }));
      }
    }
    return r;
  }

  /*********************************************************************************************************************
  * @method       registarEstadoEnvio
  * @description  Records the dispatch outcome to metrics and structured logs. Logs at error level when
  *               there are failures, and at info level on a clean dispatch.
  * @param        referencia — bulletin reference code for correlation
  * @param        falhasEmail — count of email send failures
  * @param        falhasSms — count of SMS send failures
  * @param        emails — count of unique email addresses reached
  * @param        sms — count of unique phone numbers reached
  * @uses         MetricsService.erro, MetricsService.sucesso
  *********************************************************************************************************************/
  private registarEstadoEnvio(referencia: string, falhasEmail: number, falhasSms: number, emails: number, sms: number) {
    const detalhe = { referencia, emails, sms, falhasEmail, falhasSms };
    if (falhasEmail + falhasSms > 0) {
      this.metrics.erro('envio', `${falhasEmail + falhasSms} falha(s) no envio de ${referencia}`, detalhe);
      this.logger.error(JSON.stringify({ msg: 'ALERTA: envio com falhas', ...detalhe }));
      return;
    }
    this.metrics.sucesso('envio', detalhe);
    this.logger.log(JSON.stringify({ msg: 'Envio concluído', ...detalhe }));
  }
}
