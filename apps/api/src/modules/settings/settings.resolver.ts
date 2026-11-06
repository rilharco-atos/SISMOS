import type { SystemConfig } from '@prisma/client';

export type OrigemConfig = 'backoffice' | 'env';
type Env = (key: string) => string | undefined;

export interface FtpSettings {
  origem: OrigemConfig;
  host: string;
  user: string;
  password: string;
  incomingDir: string;
  processedDir: string;
  pollIntervalMs: number;
}

export interface SmtpSettings {
  origem: OrigemConfig;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  apiKey: string;
  apiProvedor: 'nenhum' | 'resend' | 'sendgrid';
}

export interface SmsSettings {
  providerUrl: string;
  apiKey: string;
  apiUser: string;
  formato: 'generico' | 'twilio';
  sender: string;
  modo: 'test' | 'production';
  impostoPeloAmbiente: boolean;
  simulado: boolean;
}

export type Ambiente = 'production' | 'test' | 'development';

/*********************************************************************************************************************
* @method       resolverAmbiente
* @description  Resolves the current runtime environment from the APP_ENV environment variable.
*               Normalises 'teste' and 'producao' (Portuguese spellings) to their canonical values.
* @param        env — getter function that returns an env var value by key
* @return       Ambiente enum value: 'production', 'test' or 'development'
*********************************************************************************************************************/
export function resolverAmbiente(env: Env): Ambiente {
  const v = (env('APP_ENV') ?? '').toLowerCase();
  if (v === 'test' || v === 'teste') return 'test';
  if (v === 'production' || v === 'producao') return 'production';
  return 'development';
}

const POLL_MIN_MS = 5000;
const POLL_DEFAULT_MS = 30000;

const preenchido = (v?: string | null) => !!v && v.trim() !== '';

/*********************************************************************************************************************
* @method       resolverFtp
* @description  Resolves the effective FTP settings. When the DB row has a host, all FTP fields
*               come from the DB (origin = 'backoffice'). Otherwise falls back to env vars entirely.
*               The two origins are never mixed.
* @param        cfg — SystemConfig DB row, or null when absent
* @param        env — getter function that returns an env var value by key
* @return       FtpSettings value object
*********************************************************************************************************************/
export function resolverFtp(cfg: Partial<SystemConfig> | null, env: Env): FtpSettings {
  const intervalo = (v: unknown) => Math.max(POLL_MIN_MS, Number(v) || POLL_DEFAULT_MS);
  if (cfg && preenchido(cfg.ftpHost)) {
    return {
      origem: 'backoffice', host: cfg.ftpHost!.trim(), user: cfg.ftpUser || 'anonymous', password: cfg.ftpPassword ?? '',
      incomingDir: cfg.ftpIncomingDir || '/incoming', processedDir: cfg.ftpProcessedDir || '/processed',
      pollIntervalMs: intervalo(cfg.pollIntervalMs),
    };
  }
  return {
    origem: 'env', host: env('FTP_HOST') ?? '', user: env('FTP_USER') || 'anonymous', password: env('FTP_PASSWORD') ?? '',
    incomingDir: env('FTP_INCOMING_DIR') || '/incoming', processedDir: env('FTP_PROCESSED_DIR') || '/processed',
    pollIntervalMs: intervalo(env('FTP_POLL_INTERVAL_MS') ?? cfg?.pollIntervalMs),
  };
}

/*********************************************************************************************************************
* @method       formatarRemetente
* @description  Formats a sender address as "Name <email>". When the email already contains a
*               '<' character it is returned unchanged (already in RFC 5321 format).
* @param        email — raw email address or pre-formatted sender string
* @param        nome — optional display name; omitting it returns the bare email address
* @return       Formatted sender string suitable for the From: header
*********************************************************************************************************************/
export function formatarRemetente(email: string, nome?: string | null): string {
  if (email.includes('<')) return email;
  return preenchido(nome) ? `"${nome!.replace(/"/g, '')}" <${email}>` : email;
}

/*********************************************************************************************************************
* @method       resolverSmtp
* @description  Resolves the effective SMTP/email transport settings. SendGrid takes precedence over
*               Resend when both API keys are present. When a DB SMTP host is set, non-secret fields
*               come from the DB; API keys always come from env vars.
* @param        cfg — SystemConfig DB row, or null when absent
* @param        env — getter function that returns an env var value by key
* @return       SmtpSettings value object with apiKey and apiProvedor indicating the HTTP transport
*********************************************************************************************************************/
export function resolverSmtp(cfg: Partial<SystemConfig> | null, env: Env): SmtpSettings {
  const sendgrid = env('SENDGRID_API_KEY') ?? '';
  const resend = env('RESEND_API_KEY') ?? '';
  const apiKey = sendgrid || resend;
  const apiProvedor: SmtpSettings['apiProvedor'] = sendgrid ? 'sendgrid' : resend ? 'resend' : 'nenhum';
  if (cfg && preenchido(cfg.smtpHost)) {
    const port = Number(cfg.smtpPort) || 587;
    return {
      origem: 'backoffice', host: cfg.smtpHost!.trim(), port, secure: port === 465,
      user: cfg.smtpUser ?? '', password: cfg.smtpPassword ?? '',
      from: formatarRemetente(cfg.smtpFrom || cfg.smtpUser || 'sismos@ipma.pt', cfg.emailRemetente),
      apiKey, apiProvedor,
    };
  }
  const port = Number(env('SMTP_PORT')) || 587;
  return {
    origem: 'env', host: env('SMTP_HOST') ?? '', port, secure: port === 465,
    user: env('SMTP_USER') ?? '', password: env('SMTP_PASSWORD') ?? '',
    from: env('SMTP_FROM') || env('SMTP_USER') || 'sismos@ipma.pt',
    apiKey, apiProvedor,
  };
}

/*********************************************************************************************************************
* @method       resolverSms
* @description  Resolves the effective SMS transport settings. Provider URL, API key and user come
*               from env vars; sender and dispatch mode come from the DB row. In a 'test' environment
*               the mode is always forced to 'test' regardless of the DB setting.
* @param        cfg — SystemConfig DB row, or null when absent
* @param        env — getter function that returns an env var value by key
* @return       SmsSettings value object with simulado=true when ENVIO_SIMULADO is set outside production
*********************************************************************************************************************/
export function resolverSms(cfg: Partial<SystemConfig> | null, env: Env): SmsSettings {
  const ambiente = resolverAmbiente(env);
  const imposto = ambiente === 'test';
  return {
    simulado: ambiente !== 'production' && (env('ENVIO_SIMULADO') ?? '').toLowerCase() === 'true',
    providerUrl: env('SMS_PROVIDER_URL') ?? '',
    apiKey: env('SMS_API_KEY') ?? '',
    apiUser: env('SMS_API_USER') ?? '',
    formato: (env('SMS_PROVIDER_FORMATO') ?? '').toLowerCase() === 'twilio' ? 'twilio' : 'generico',
    sender: (preenchido(cfg?.smsSender) ? cfg!.smsSender! : env('SMS_SENDER')) || 'IPMA',
    modo: !imposto && cfg?.smsMode === 'production' ? 'production' : 'test',
    impostoPeloAmbiente: imposto,
  };
}
