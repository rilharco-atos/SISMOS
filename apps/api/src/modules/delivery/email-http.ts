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

/** Interface mínima comum ao transporte SMTP (nodemailer) e ao transporte HTTP. */
export interface TransporteEmail {
  sendMail(m: MensagemEmail): Promise<unknown>;
}

const RESEND_URL = 'https://api.resend.com/emails';

/** Substitui as referências cid: pelas imagens embutidas como data URI. */
export function embutirImagens(html: string, attachments: Attachment[]): string {
  let out = html;
  for (const a of attachments) {
    if (a.cid && Buffer.isBuffer(a.content)) {
      out = out.replace(`cid:${a.cid}`, `data:${a.contentType};base64,${a.content.toString('base64')}`);
    }
  }
  return out;
}

/**
 * Envio por HTTPS, para ambientes onde as portas SMTP estão fechadas — é o caso
 * das plataformas de alojamento cloud, que as bloqueiam contra spam. Na rede
 * interna do IPMA o SMTP funciona e este transporte fica inativo.
 *
 * A API não aceita imagens inline por cid, por isso o logótipo e o mapa de
 * intensidades seguem embutidos no HTML como data URI.
 */
export class TransporteResend implements TransporteEmail {
  constructor(private readonly http: HttpService, private readonly apiKey: string) {}

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
