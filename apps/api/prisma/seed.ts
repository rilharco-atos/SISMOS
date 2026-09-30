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

async function seedDemo() {
  const demos: Array<{
    referencia: string; ano: number; numeroAno: number; templateId: string;
    estado: string; primeiraPagina: boolean; titulo: string; texto: string;
    local: string; areaName: string; eventDateTime: string;
    lat: number; lon: number; depth: number; magnitude: number;
    intmax?: string; websiteInicio?: string; websiteFim?: string;
  }> = [
    { referencia: 'DEMO-2026-001', ano: 2026, numeroAno: 1, templateId: '0001', estado: 'ENVIADO', primeiraPagina: true,
      titulo: 'Sismo sentido na Região dos Açores', texto: 'Ocorreu um sismo de magnitude 5.8 ML com epicentro na região dos Açores (ilha do Faial). O sismo foi sentido em várias ilhas do grupo Central.',
      local: 'Faial, Açores', areaName: 'Açores', eventDateTime: '2026-09-01T14:23:00Z', lat: 38.532, lon: -28.634, depth: 12, magnitude: 5.8, intmax: 'VI', websiteInicio: '2026-09-01T15:00:00Z', websiteFim: '2026-09-08T15:00:00Z' },
    { referencia: 'DEMO-2026-002', ano: 2026, numeroAno: 2, templateId: '0001', estado: 'ENVIADO', primeiraPagina: false,
      titulo: 'Sismo sentido no Algarve', texto: 'Registou-se um sismo de magnitude 3.8 ML com epicentro a sudoeste de Lagos, no Algarve. O evento foi sentido de forma fraca na região.',
      local: 'Lagos, Algarve', areaName: 'Continente', eventDateTime: '2026-09-03T09:47:00Z', lat: 37.084, lon: -8.812, depth: 18, magnitude: 3.8, intmax: 'III' },
    { referencia: 'DEMO-2026-003', ano: 2026, numeroAno: 3, templateId: '0002', estado: 'APROVADO', primeiraPagina: true,
      titulo: 'Sismo sentido na Ilha da Madeira', texto: 'Ocorreu um sismo de magnitude 3.4 ML com epicentro a norte da ilha da Madeira. O evento foi sentido de forma moderada nos concelhos do norte.',
      local: 'Norte da Madeira', areaName: 'Madeira', eventDateTime: '2026-09-05T22:11:00Z', lat: 32.824, lon: -17.041, depth: 9, magnitude: 3.4 },
    { referencia: 'DEMO-2026-004', ano: 2026, numeroAno: 4, templateId: '0001', estado: 'ENVIADO', primeiraPagina: true,
      titulo: 'Sismo sentido na Região dos Açores — Sismo de grande magnitude', texto: 'Ocorreu um sismo de magnitude 6.1 ML com epicentro na região dos Açores. O evento foi amplamente sentido em todo o arquipélago. Activada a monitorização de Alerta de Tsunami.',
      local: 'S. Miguel, Açores', areaName: 'Açores', eventDateTime: '2026-09-07T03:58:00Z', lat: 37.741, lon: -25.516, depth: 8, magnitude: 6.1, intmax: 'VII', websiteInicio: '2026-09-07T05:00:00Z', websiteFim: '2026-09-14T05:00:00Z' },
    { referencia: 'DEMO-2026-005', ano: 2026, numeroAno: 5, templateId: '0000', estado: 'RASCUNHO', primeiraPagina: false,
      titulo: 'Sismo sentido em Lisboa e Vale do Tejo', texto: 'Registou-se um sismo de magnitude 2.9 ML com epicentro na região da Margem Sul do Tejo. Fraca sentido na região de Lisboa.',
      local: 'Almada, Setúbal', areaName: 'Continente', eventDateTime: '2026-09-09T16:33:00Z', lat: 38.678, lon: -9.154, depth: 22, magnitude: 2.9 },
    { referencia: 'DEMO-2026-006', ano: 2026, numeroAno: 6, templateId: '0001', estado: 'ENVIADO', primeiraPagina: false,
      titulo: 'Sismo sentido na Região de Évora', texto: 'Ocorreu um sismo de magnitude 3.2 ML com epicentro a norte de Évora. O evento foi sentido de forma fraca em Évora e concelhos adjacentes.',
      local: 'Norte de Évora', areaName: 'Continente', eventDateTime: '2026-09-10T11:04:00Z', lat: 38.671, lon: -7.903, depth: 15, magnitude: 3.2, intmax: 'II' },
    { referencia: 'DEMO-2026-007', ano: 2026, numeroAno: 7, templateId: '0001', estado: 'ENVIADO', primeiraPagina: false,
      titulo: 'Sismo sentido no Grupo Ocidental dos Açores', texto: 'Ocorreu um sismo de magnitude 4.7 ML com epicentro a oeste das ilhas do Grupo Ocidental (Corvo e Flores). O evento foi sentido nas duas ilhas.',
      local: 'Flores e Corvo, Açores', areaName: 'Açores', eventDateTime: '2026-09-12T07:29:00Z', lat: 39.445, lon: -31.112, depth: 14, magnitude: 4.7 },
    { referencia: 'DEMO-2026-008', ano: 2026, numeroAno: 8, templateId: '0002', estado: 'PENDENTE', primeiraPagina: false,
      titulo: 'Sismo sentido no Alentejo', texto: 'Registou-se um sismo de magnitude 3.6 ML com epicentro a sul de Beja. O evento foi sentido de forma fraca em Beja e concelhos do Baixo Alentejo.',
      local: 'Sul de Beja', areaName: 'Continente', eventDateTime: '2026-09-14T20:51:00Z', lat: 37.612, lon: -7.874, depth: 11, magnitude: 3.6 },
    { referencia: 'DEMO-2026-009', ano: 2026, numeroAno: 9, templateId: '0001', estado: 'ENVIADO', primeiraPagina: true,
      titulo: 'Sismo sentido na Ilha do Pico — Açores', texto: 'Ocorreu um sismo de magnitude 5.1 ML com epicentro a sul da ilha do Pico. O evento foi sentido com intensidade moderada em todo o grupo central dos Açores.',
      local: 'Pico, Açores', areaName: 'Açores', eventDateTime: '2026-09-16T17:43:00Z', lat: 38.401, lon: -28.341, depth: 16, magnitude: 5.1, intmax: 'V', websiteInicio: '2026-09-16T19:00:00Z', websiteFim: '2026-09-23T19:00:00Z' },
    { referencia: 'DEMO-2026-010', ano: 2026, numeroAno: 10, templateId: '0000', estado: 'CANCELADO', primeiraPagina: false,
      titulo: 'Sismo sentido em Castelo Branco', texto: 'Registou-se um sismo de magnitude 2.6 ML com epicentro na região de Castelo Branco. O evento foi sentido de forma muito fraca.',
      local: 'Castelo Branco', areaName: 'Continente', eventDateTime: '2026-09-18T08:17:00Z', lat: 39.822, lon: -7.483, depth: 10, magnitude: 2.6 },
  ];

  for (const d of demos) {
    const { referencia, ano, numeroAno, templateId, estado, primeiraPagina, titulo, texto,
            local, areaName, eventDateTime, lat, lon, depth, magnitude, intmax,
            websiteInicio, websiteFim } = d;
    const existing = await prisma.comunicado.findUnique({ where: { referencia } });
    if (existing) continue;
    const comunicado = await prisma.comunicado.create({
      data: {
        referencia, ano, numeroAno, templateId,
        estado: estado as any, primeiraPagina, titulo, texto,
        local, areaName,
        eventDateTime: new Date(eventDateTime),
        lat: lat as any, lon: lon as any,
        depth: depth as any, magnitude: magnitude as any,
        intmax: intmax ?? null,
        websiteInicio: websiteInicio ? new Date(websiteInicio) : null,
        websiteFim: websiteFim ? new Date(websiteFim) : null,
        criadoPorId: 'system',
        criadoEm: new Date(eventDateTime),
        atualizadoEm: new Date(eventDateTime),
      },
    });
    await prisma.versao.create({
      data: {
        comunicadoId: comunicado.id,
        numero: 1,
        titulo,
        texto,
        criadoEm: new Date(eventDateTime),
      },
    });
    process.stdout.write(`Demo criado: ${referencia}\n`);
  }
}

main()
  .then(() => seedDemo())
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
