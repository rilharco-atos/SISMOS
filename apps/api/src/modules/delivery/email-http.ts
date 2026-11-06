import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { Attachment } from 'nodemailer/lib/mailer';

export interface MensagemEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments: Attachment[];
}

export interface TransporteEmail {
  sendMail(m: MensagemEmail): Promise<unknown>;
}

const RESEND_URL = 'https://api.resend.com/emails';
const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send';

/*********************************************************************************************************************
* @method       partirRemetente
* @description  Parses a "Name" <email> formatted sender string into its email and optional name parts.
*               When no display name is present, returns only the email address.
* @param        from — sender string, either plain email or "Name" <email> format
* @return       Object with email string and optional name string
*********************************************************************************************************************/
export function partirRemetente(from: string): { email: string; name?: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (!m) return { email: from.trim() };
  const name = m[1].trim();
  return name ? { email: m[2].trim(), name } : { email: m[2].trim() };
}

/*********************************************************************************************************************
* @method       embutirImagens
* @description  Replaces cid: references in an HTML string with inline data URIs for the matching
*               Buffer attachments. Used to embed logo and intensity map in preview and in HTTPS transports.
* @param        html — HTML string potentially containing cid: src references
* @param        attachments — array of nodemailer Attachment objects with cid and Buffer content
* @return       HTML string with cid: references replaced by data: URIs
*********************************************************************************************************************/
export function embutirImagens(html: string, attachments: Attachment[]): string {
  let out = html;
  for (const a of attachments) {
    if (a.cid && Buffer.isBuffer(a.content)) {
      out = out.replace(`cid:${a.cid}`, `data:${a.contentType};base64,${a.content.toString('base64')}`);
    }
  }
  return out;
}

/***********************************************************************************************************************
* @class         TransporteResend
* @description   Email transport that sends via the Resend HTTPS API. Used in cloud hosting environments
*                where SMTP ports are blocked. The logo and intensity map are embedded as data URIs because
*                the Resend API does not support inline CID attachments.
*
* @responsibilities
*                 - Send HTML + plain-text email messages via the Resend REST API
*                 - Embed inline CID images as data URIs before sending
*                 - Forward non-inline attachments (e.g. PDF) as base64 encoded content
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - On the IPMA internal network, SMTP is preferred; this transport is inactive there.
*                 - Timeout is 15 seconds to match the platform's standard HTTP timeout.
***********************************************************************************************************************/
export class TransporteResend implements TransporteEmail {
  constructor(private readonly http: HttpService, private readonly apiKey: string) {}

  /*********************************************************************************************************************
  * @method       sendMail
  * @description  Sends the email via the Resend API. Embeds CID images as data URIs and forwards
  *               non-inline Buffer attachments as base64 encoded content in the request payload.
  * @param        m — MensagemEmail with from, to, subject, html, text and attachments
  * @return       Resend API response data
  * @uses         embutirImagens, HttpService.post
  *********************************************************************************************************************/
  async sendMail(m: MensagemEmail): Promise<unknown> {
    const anexos = m.attachments.filter(a => !a.cid && Buffer.isBuffer(a.content));
    const res = await firstValueFrom(
      this.http.post(
        RESEND_URL,
        {
          from: m.from,
          to: [m.to],
          subject: m.subject,
          html: embutirImagens(m.html, m.attachments),
          text: m.text,
          attachments: anexos.map(a => ({
            filename: typeof a.filename === 'string' ? a.filename : 'anexo',
            content: (a.content as Buffer).toString('base64'),
          })),
        },
        {
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          timeout: 15000,
        },
      ),
    );
    return res.data;
  }
}

/***********************************************************************************************************************
* @class         TransporteSendgrid
* @description   Email transport that sends via the SendGrid HTTPS API. Unlike Resend, SendGrid only
*                requires sender address verification (not domain verification), making it suitable for
*                demonstrations. Supports inline CID attachments natively.
*
* @responsibilities
*                 - Send HTML + plain-text email messages via the SendGrid v3 REST API
*                 - Map nodemailer CID attachments to SendGrid inline disposition format
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Inline images (logo, map) are sent as SendGrid attachments with disposition 'inline'.
*                 - The from field is parsed into email + name via partirRemetente().
***********************************************************************************************************************/
export class TransporteSendgrid implements TransporteEmail {
  constructor(private readonly http: HttpService, private readonly apiKey: string) {}

  /*********************************************************************************************************************
  * @method       sendMail
  * @description  Sends the email via the SendGrid v3 API. Maps nodemailer attachments to the SendGrid
  *               format, preserving inline/attachment disposition based on the cid field presence.
  * @param        m — MensagemEmail with from, to, subject, html, text and attachments
  * @return       SendGrid API response data
  * @uses         partirRemetente, HttpService.post
  *********************************************************************************************************************/
  async sendMail(m: MensagemEmail): Promise<unknown> {
    const anexos = m.attachments
      .filter(a => Buffer.isBuffer(a.content))
      .map(a => ({
        content: (a.content as Buffer).toString('base64'),
        filename: typeof a.filename === 'string' ? a.filename : 'anexo',
        type: a.contentType,
        disposition: a.cid ? 'inline' : 'attachment',
        ...(a.cid ? { content_id: a.cid } : {}),
      }));

    const res = await firstValueFrom(
      this.http.post(
        SENDGRID_URL,
        {
          personalizations: [{ to: [{ email: m.to }] }],
          from: partirRemetente(m.from),
          subject: m.subject,
          content: [
            { type: 'text/plain', value: m.text },
            { type: 'text/html', value: m.html },
          ],
          ...(anexos.length ? { attachments: anexos } : {}),
        },
        {
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          timeout: 15000,
        },
      ),
    );
    return res.data;
  }
}
