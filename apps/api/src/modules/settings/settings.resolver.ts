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
  /**
   * Chave da API HTTP de email. Quando definida, o envio vai por HTTPS em vez
   * de SMTP — necessário onde as portas SMTP estão bloqueadas (alojamento cloud).
   * Fica vazia na instalação do IPMA, onde o SMTP interno funciona.
   */
  apiKey: string;
}

export interface SmsSettings {
  providerUrl: string;
  apiKey: string;
  /** Utilizador da autenticação básica; no Twilio é o Account SID. Vazio no formato genérico. */
  apiUser: string;
  /**
   * Formato do pedido ao fornecedor. "generico" é o do SMSExpress MEO usado pelo
   * IPMA; "twilio" existe para ambientes de demonstração sem acesso a esse serviço.
   */
  formato: 'generico' | 'twilio';
  sender: string;
  /** 'test': só contactos internos recebem; 'production': envio real. */
  modo: 'test' | 'production';
  /** true quando o modo teste é imposto pelo ambiente (APP_ENV=test) e não pode ser alterado. */
  impostoPeloAmbiente: boolean;
  /** Demonstração: nenhuma mensagem sai (ENVIO_SIMULADO=true); nunca ativo em produção. */
  simulado: boolean;
}

export type Ambiente = 'production' | 'test' | 'development';

/** Ambiente da instalação. Em "test" nunca há envios para destinatários externos. */
export function resolverAmbiente(env: Env): Ambiente {
  const v = (env('APP_ENV') ?? '').toLowerCase();
  if (v === 'test' || v === 'teste') return 'test';
  if (v === 'production' || v === 'producao') return 'production';
  return 'development';
}

const POLL_MIN_MS = 5000;
const POLL_DEFAULT_MS = 30000;

const preenchido = (v?: string | null) => !!v && v.trim() !== '';

/**
 * FTP: se o host estiver definido no backoffice, todo o bloco vem da base de dados;
 * caso contrário usa as variáveis de ambiente. Nunca mistura as duas origens.
 */
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

/** Remetente no formato "Nome <email>"; se o valor já trouxer "<", é usado tal como está. */
export function formatarRemetente(email: string, nome?: string | null): string {
  if (email.includes('<')) return email;
  return preenchido(nome) ? `"${nome!.replace(/"/g, '')}" <${email}>` : email;
}

/** SMTP: mesma regra do FTP, decidida pelo host SMTP. */
export function resolverSmtp(cfg: Partial<SystemConfig> | null, env: Env): SmtpSettings {
  const apiKey = env('RESEND_API_KEY') ?? '';
  if (cfg && preenchido(cfg.smtpHost)) {
    const port = Number(cfg.smtpPort) || 587;
    return {
      origem: 'backoffice', host: cfg.smtpHost!.trim(), port, secure: port === 465,
      user: cfg.smtpUser ?? '', password: cfg.smtpPassword ?? '',
      from: formatarRemetente(cfg.smtpFrom || cfg.smtpUser || 'sismos@ipma.pt', cfg.emailRemetente),
      apiKey,
    };
  }
  const port = Number(env('SMTP_PORT')) || 587;
  return {
    origem: 'env', host: env('SMTP_HOST') ?? '', port, secure: port === 465,
    user: env('SMTP_USER') ?? '', password: env('SMTP_PASSWORD') ?? '',
    from: env('SMTP_FROM') || env('SMTP_USER') || 'sismos@ipma.pt',
    apiKey,
  };
}

/**
 * Envio (email e SMS): URL e chave do fornecedor são segredos de ambiente; remetente e modo vêm do backoffice.
 * No ambiente de teste o modo é sempre "test", independentemente do backoffice.
 */
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
