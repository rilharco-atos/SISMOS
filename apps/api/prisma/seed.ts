import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  // Em produção as credenciais do administrador inicial vêm obrigatoriamente do ambiente.
  const producao = process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'rui.ilharco.external@atos.ai';
  const adminNome = process.env.SEED_ADMIN_NAME ?? 'Rui Ilharco';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? (producao ? undefined : 'secret123');
  if (!adminPassword) throw new Error('Defina SEED_ADMIN_PASSWORD para criar o administrador inicial em produção');
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existing) {
    await prisma.user.create({
      data: {
        name: adminNome,
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        role: 'ADMIN',
        active: true,
      },
    });
    process.stdout.write(`Admin criado: ${adminEmail}\n`);
  }

  // Utilizador técnico do fluxo automático (FTP). Inativo: não consegue autenticar-se.
  await prisma.user.upsert({
    where: { id: 'system' },
    update: {},
    create: {
      id: 'system',
      name: 'Sistema (importação automática)',
      email: 'sistema@sismos.local',
      passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
      role: 'ANALISTA',
      active: false,
    },
  });

  const cfg = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg) {
    await prisma.systemConfig.create({
      data: {
        id: 'singleton',
        ftpHost: '',
        ftpUser: 'anonymous',
        ftpPassword: '',
        ftpIncomingDir: '/incoming',
        ftpProcessedDir: '/processed',
        pollIntervalMs: 30000,
        smtpHost: '',
        smtpPort: 587,
        smtpUser: '',
        smtpPassword: '',
        smtpFrom: 'sismos@ipma.pt',
        smsSender: 'IPMA',
        smsMode: 'test',
        emailRemetente: 'IPMA — Serviço de Sismologia',
        assinaturaTecnica: 'Instituto Português do Mar e da Atmosfera, I.P.',
        fusoHorario: 'UTC',
      },
    });
    process.stdout.write('SystemConfig inicializado\n');
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
