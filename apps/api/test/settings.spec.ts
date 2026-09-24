import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { resolverFtp, resolverSmtp, resolverSms, formatarRemetente } from '../src/modules/settings/settings.resolver';

const ENV: Record<string, string> = {
  FTP_HOST: 'ftp.env', FTP_USER: 'u-env', FTP_PASSWORD: 'p-env', FTP_INCOMING_DIR: '/sismos/incoming', FTP_PROCESSED_DIR: '/sismos/processed',
  SMTP_HOST: 'smtp.env', SMTP_PORT: '587', SMTP_USER: 'sismos@ipma.pt', SMTP_PASSWORD: 's-env', SMTP_FROM: '"IPMA Sismologia" <sismos@ipma.pt>',
  SMS_PROVIDER_URL: 'https://sms', SMS_API_KEY: 'k', SMS_SENDER: 'IPMA-SISMOS',
};
const env = (k: string) => ENV[k];

describe('Configuração FTP', () => {
  test('sem host no backoffice usa o bloco .env completo (não mistura pastas por omissão da BD)', () => {
    const r = resolverFtp({ ftpHost: '', ftpIncomingDir: '/incoming', pollIntervalMs: 30000 }, env);
    assert.equal(r.origem, 'env');
    assert.equal(r.host, 'ftp.env');
    assert.equal(r.incomingDir, '/sismos/incoming');
  });

  test('com host no backoffice usa o bloco da BD', () => {
    const r = resolverFtp({ ftpHost: 'ftp.bd', ftpUser: 'u', ftpPassword: 'p', ftpIncomingDir: '/in', ftpProcessedDir: '/out', pollIntervalMs: 60000 }, env);
    assert.deepEqual(r, { origem: 'backoffice', host: 'ftp.bd', user: 'u', password: 'p', incomingDir: '/in', processedDir: '/out', pollIntervalMs: 60000 });
  });

  test('intervalo nunca abaixo de 5 s', () => {
    assert.equal(resolverFtp({ ftpHost: 'x', pollIntervalMs: 100 }, env).pollIntervalMs, 5000);
  });

  test('sem BD nem .env fica sem host (polling desligado)', () => {
    assert.equal(resolverFtp(null, () => undefined).host, '');
  });
});

describe('Configuração SMTP', () => {
  test('backoffice: porta 465 ativa TLS e remetente com nome', () => {
    const r = resolverSmtp({ smtpHost: 'smtp.bd', smtpPort: 465, smtpUser: 'a@ipma.pt', smtpPassword: 'x', smtpFrom: 'sismos@ipma.pt', emailRemetente: 'IPMA — Sismologia' }, env);
    assert.equal(r.origem, 'backoffice');
    assert.equal(r.secure, true);
    assert.equal(r.from, '"IPMA — Sismologia" <sismos@ipma.pt>');
  });

  test('sem host no backoffice usa .env', () => {
    const r = resolverSmtp({ smtpHost: '', smtpFrom: 'outro@ipma.pt' }, env);
    assert.equal(r.origem, 'env');
    assert.equal(r.from, '"IPMA Sismologia" <sismos@ipma.pt>');
    assert.equal(r.secure, false);
  });

  test('remetente já formatado mantém-se', () => {
    assert.equal(formatarRemetente('X <a@b.pt>', 'Nome'), 'X <a@b.pt>');
    assert.equal(formatarRemetente('a@b.pt', ''), 'a@b.pt');
  });
});

describe('Configuração SMS', () => {
  test('segredos do .env, remetente e modo do backoffice', () => {
    const r = resolverSms({ smsSender: 'IPMA', smsMode: 'production' }, env);
    assert.equal(r.apiKey, 'k');
    assert.equal(r.sender, 'IPMA');
    assert.equal(r.modo, 'production');
  });

  test('modo desconhecido cai para teste', () => {
    assert.equal(resolverSms({ smsMode: 'x' }, env).modo, 'test');
    assert.equal(resolverSms(null, env).sender, 'IPMA-SISMOS');
  });
});
