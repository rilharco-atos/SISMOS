'use strict';
// Script de seed de demonstração — corre no arranque do container Railway.
// Usa apenas dependências de produção: @prisma/client e bcrypt.
// Idempotente: verifica existência antes de inserir.

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { randomBytes } = require('crypto');

const prisma = new PrismaClient({ log: ['error'] });

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'rui.ilharco.external@atos.ai';
const ADMIN_NOME  = process.env.SEED_ADMIN_NAME  || 'Rui Ilharco';
const ADMIN_PASS  = process.env.SEED_ADMIN_PASSWORD || 'Sismos-Hvu66Ufo6Lbq';

// ---------------------------------------------------------------------------
// Dados dos 6 sismos de demonstração
// ---------------------------------------------------------------------------
const SISMOS = [
  {
    referencia: 'SISM-2026-0101',
    ano: 2026, numeroAno: 1,
    titulo: 'Sismo — Arraiolos (Magnitude 3.8)',
    local: 'Arraiolos', areaName: 'Continente',
    eventDateTime: new Date('2026-01-15T09:23:00Z'),
    lat: '38.710000', lon: '-8.000000', depth: '8.00', magnitude: '3.8',
    intmax: 'III', regiaoIntmax: 'Arraiolos',
    estado: 'ENVIADO',
    smsListas: ['LGC'], emailListas: ['LGC', 'LIC'],
    texto: 'Sismo de magnitude 3.8 (MLv) registado na região de Arraiolos em 15/01/2026 às 09h23 UTC.',
    versoes: [
      {
        numero: 1,
        titulo: 'Comunicado n.º 1 — Arraiolos (M 3.8)',
        texto: `O Instituto Português do Mar e da Atmosfera (IPMA) informa que, no dia 15 de Janeiro de 2026, às 09h 23m (UTC), foi registado um sismo de magnitude 3.8 (MLv), com epicentro na região de Arraiolos, distrito de Évora.

Data: 15/01/2026  |  Hora (UTC): 09h 23m
Latitude: 38.71°N  |  Longitude: 8.00°W
Profundidade: 8 km  |  Magnitude: 3.8 (MLv)
Intensidade máxima observada: III (Mercalli modificada), na região de Arraiolos

O sismo foi sentido nas localidades de Arraiolos, Mora e Évora. Não foram recebidas informações sobre danos pessoais ou materiais.

Instituto Português do Mar e da Atmosfera, I.P. — Serviço de Sismologia`,
      },
      {
        numero: 2,
        titulo: 'Comunicado n.º 2 — Arraiolos (M 3.8, atualização)',
        texto: `ATUALIZAÇÃO — O Instituto Português do Mar e da Atmosfera (IPMA) informa que os parâmetros do sismo de 15 de Janeiro de 2026 registado na região de Arraiolos foram revistos após análise completa dos dados da rede sismográfica nacional.

Data: 15/01/2026  |  Hora (UTC): 09h 23m
Latitude: 38.71°N  |  Longitude: 8.00°W
Profundidade: 8 km  |  Magnitude: 3.8 (MLv) — confirmada
Intensidade máxima observada: III (Mercalli modificada), nas regiões de Arraiolos e Mora

Até ao momento não foram reportados danos. O IPMA continuará a monitorizar a atividade sísmica na região.

Instituto Português do Mar e da Atmosfera, I.P. — Serviço de Sismologia`,
      },
    ],
  },
  {
    referencia: 'SISM-2026-0102',
    ano: 2026, numeroAno: 2,
    titulo: 'Sismo — Arquipélago dos Açores / Faial (Magnitude 5.2)',
    local: 'Faial', areaName: 'Açores',
    eventDateTime: new Date('2026-02-03T14:47:00Z'),
    lat: '38.550000', lon: '-28.720000', depth: '10.00', magnitude: '5.2',
    intmax: 'IV-V', regiaoIntmax: 'Horta (Faial)',
    estado: 'ENVIADO',
    smsListas: ['LGA'], emailListas: ['LGA', 'LIA'],
    texto: 'Sismo de magnitude 5.2 (MLv) registado na região do Faial, Açores, em 03/02/2026 às 14h47 UTC.',
    versoes: [
      {
        numero: 1,
        titulo: 'Comunicado n.º 1 — Faial / Açores (M 5.2)',
        texto: `O Instituto Português do Mar e da Atmosfera (IPMA) informa que, no dia 3 de Fevereiro de 2026, às 14h 47m (UTC), foi registado um sismo de magnitude 5.2 (MLv), com epicentro na região do Faial, Arquipélago dos Açores.

Data: 03/02/2026  |  Hora (UTC): 14h 47m  |  Hora Local (AZOT): 13h 47m
Latitude: 38.55°N  |  Longitude: 28.72°W
Profundidade: 10 km  |  Magnitude: 5.2 (MLv)
Intensidade máxima observada: IV-V (Mercalli modificada), na cidade da Horta (Faial)

O sismo foi sentido em todas as ilhas do Grupo Central (Faial, Pico, São Jorge) e ligeiramente nas ilhas do Grupo Oriental. O IPMA não dispõe, até ao momento, de informações sobre danos pessoais ou materiais. As autoridades regionais de proteção civil foram informadas.

Instituto Português do Mar e da Atmosfera, I.P. — Serviço de Sismologia`,
      },
      {
        numero: 2,
        titulo: 'Comunicado n.º 2 — Faial / Açores (M 5.2, atualização)',
        texto: `ATUALIZAÇÃO — O Instituto Português do Mar e da Atmosfera (IPMA) emite o presente comunicado de atualização relativamente ao sismo de magnitude 5.2 (MLv) registado na região do Faial em 3 de Fevereiro de 2026.

Data: 03/02/2026  |  Hora (UTC): 14h 47m
Latitude: 38.55°N  |  Longitude: 28.72°W
Profundidade: 10 km  |  Magnitude: 5.2 (MLv) — confirmada
Intensidade máxima observada: V (Mercalli modificada), na freguesia de Castelo Branco (Faial)

Registaram-se algumas réplicas de menor magnitude (M < 2.5) nas horas seguintes. Foram reportados danos ligeiros em algumas habitações antigas da cidade da Horta. O IPMA continuará a acompanhar a evolução da crise sísmica.

Instituto Português do Mar e da Atmosfera, I.P. — Serviço de Sismologia`,
      },
    ],
  },
  {
    referencia: 'SISM-2026-0103',
    ano: 2026, numeroAno: 3,
    titulo: 'Sismo — Região de Lisboa (Magnitude 4.1)',
    local: 'Região de Lisboa', areaName: 'Continente',
    eventDateTime: new Date('2026-03-08T07:12:00Z'),
    lat: '38.720000', lon: '-9.140000', depth: '5.00', magnitude: '4.1',
    intmax: 'III-IV', regiaoIntmax: 'Lisboa',
    estado: 'APROVADO',
    smsListas: ['LGC'], emailListas: ['LGC', 'LIC'],
    texto: 'Sismo de magnitude 4.1 (MLv) registado na região de Lisboa em 08/03/2026 às 07h12 UTC.',
    versoes: [
      {
        numero: 1,
        titulo: 'Comunicado n.º 1 — Região de Lisboa (M 4.1)',
        texto: `O Instituto Português do Mar e da Atmosfera (IPMA) informa que, no dia 8 de Março de 2026, às 07h 12m (UTC), foi registado um sismo de magnitude 4.1 (MLv), com epicentro na região de Lisboa.

Data: 08/03/2026  |  Hora (UTC): 07h 12m  |  Hora Local (WET): 07h 12m
Latitude: 38.72°N  |  Longitude: 9.14°W
Profundidade: 5 km  |  Magnitude: 4.1 (MLv)
Intensidade máxima observada: III-IV (Mercalli modificada), nos concelhos de Lisboa e Oeiras

O sismo foi amplamente sentido na Área Metropolitana de Lisboa e em alguns concelhos do Alentejo Litoral. Não foram recebidas informações sobre danos pessoais ou materiais. O IPMA monitoriza a atividade sísmica nacional em contínuo.

Instituto Português do Mar e da Atmosfera, I.P. — Serviço de Sismologia`,
      },
    ],
  },
  {
    referencia: 'SISM-2026-0104',
    ano: 2026, numeroAno: 4,
    titulo: 'Sismo — Região de Faro / Algarve (Magnitude 4.7)',
    local: 'Faro', areaName: 'Continente',
    eventDateTime: new Date('2026-04-22T16:35:00Z'),
    lat: '37.010000', lon: '-8.000000', depth: '12.00', magnitude: '4.7',
    intmax: 'IV', regiaoIntmax: 'Faro',
    estado: 'PENDENTE',
    smsListas: ['LGC'], emailListas: ['LGC', 'LIC'],
    texto: 'Sismo de magnitude 4.7 (MLv) registado na região de Faro, Algarve, em 22/04/2026 às 16h35 UTC.',
    versoes: [
      {
        numero: 1,
        titulo: 'Comunicado n.º 1 — Região de Faro / Algarve (M 4.7)',
        texto: `O Instituto Português do Mar e da Atmosfera (IPMA) informa que, no dia 22 de Abril de 2026, às 16h 35m (UTC), foi registado um sismo de magnitude 4.7 (MLv), com epicentro na região de Faro, distrito do Algarve.

Data: 22/04/2026  |  Hora (UTC): 16h 35m  |  Hora Local (WEST): 17h 35m
Latitude: 37.01°N  |  Longitude: 8.00°W
Profundidade: 12 km  |  Magnitude: 4.7 (MLv)
Intensidade máxima observada: IV (Mercalli modificada), no concelho de Faro

O sismo foi sentido nos concelhos de Faro, Loulé, Tavira e Olhão. O IPMA não dispõe, até ao momento, de informações sobre danos. A Autoridade Nacional de Emergência e Proteção Civil (ANEPC) foi notificada.

Instituto Português do Mar e da Atmosfera, I.P. — Serviço de Sismologia`,
      },
    ],
  },
  {
    referencia: 'SISM-2026-0105',
    ano: 2026, numeroAno: 5,
    titulo: 'Sismo — Atlântico, a SW do Arquipélago dos Açores (Magnitude 6.1)',
    local: 'Atlântico — SW dos Açores', areaName: 'Açores',
    eventDateTime: new Date('2026-05-10T02:18:00Z'),
    lat: '35.900000', lon: '-26.000000', depth: '20.00', magnitude: '6.1',
    intmax: 'II-III', regiaoIntmax: 'Flores (Açores)',
    estado: 'RASCUNHO',
    smsListas: ['LGA'], emailListas: ['LGA', 'LIA'],
    texto: 'Sismo de magnitude 6.1 (MLv) registado no Atlântico, a SW do Arquipélago dos Açores, em 10/05/2026 às 02h18 UTC.',
    versoes: [
      {
        numero: 1,
        titulo: 'Comunicado n.º 1 — Atlântico SW dos Açores (M 6.1) [RASCUNHO]',
        texto: `[RASCUNHO — pendente de revisão]

O Instituto Português do Mar e da Atmosfera (IPMA) informa que, no dia 10 de Maio de 2026, às 02h 18m (UTC), foi registado um sismo de magnitude 6.1 (MLv), com epicentro no Oceano Atlântico, a sudoeste do Arquipélago dos Açores.

Data: 10/05/2026  |  Hora (UTC): 02h 18m  |  Hora Local (AZOT): 01h 18m
Latitude: 35.90°N  |  Longitude: 26.00°W
Profundidade: 20 km  |  Magnitude: 6.1 (MLv)
Intensidade máxima observada: II-III (Mercalli modificada), na ilha das Flores

Dado o epicentro oceânico, a intensidade em território foi moderada. O Sistema de Alerta de Tsunamis do Atlântico Nordeste (NEAMTWS) não emitiu qualquer alerta. O IPMA aguarda informações complementares das autoridades regionais.

Instituto Português do Mar e da Atmosfera, I.P. — Serviço de Sismologia`,
      },
    ],
  },
  {
    referencia: 'SISM-2026-0106',
    ano: 2026, numeroAno: 6,
    titulo: 'Sismo — Covilhã / Beira Interior (Magnitude 3.5)',
    local: 'Covilhã', areaName: 'Continente',
    eventDateTime: new Date('2026-06-05T11:44:00Z'),
    lat: '40.280000', lon: '-7.500000', depth: '6.00', magnitude: '3.5',
    intmax: 'II', regiaoIntmax: 'Covilhã',
    estado: 'RASCUNHO',
    smsListas: ['LGC'], emailListas: ['LGC'],
    texto: 'Sismo de magnitude 3.5 (MLv) registado na região da Covilhã em 05/06/2026 às 11h44 UTC.',
    versoes: [
      {
        numero: 1,
        titulo: 'Comunicado n.º 1 — Covilhã / Beira Interior (M 3.5) [RASCUNHO]',
        texto: `[RASCUNHO — pendente de revisão]

O Instituto Português do Mar e da Atmosfera (IPMA) informa que, no dia 5 de Junho de 2026, às 11h 44m (UTC), foi registado um sismo de magnitude 3.5 (MLv), com epicentro na região da Covilhã, distrito de Castelo Branco.

Data: 05/06/2026  |  Hora (UTC): 11h 44m  |  Hora Local (WEST): 12h 44m
Latitude: 40.28°N  |  Longitude: 7.50°W
Profundidade: 6 km  |  Magnitude: 3.5 (MLv)
Intensidade máxima observada: II (Mercalli modificada), na área epicentral

O sismo foi sentido débil por alguns habitantes da Covilhã e Belmonte. Não foram recebidas informações sobre danos.

Instituto Português do Mar e da Atmosfera, I.P. — Serviço de Sismologia`,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Destinatários de demonstração
// ---------------------------------------------------------------------------
const DESTINATARIOS = [
  {
    nome: 'Ana Ferreira', organizacao: 'IPMA — Direção de Serviços de Observação',
    email: 'ana.ferreira@ipma-demo.pt', telefone: '+351910000001', interno: true,
    listas: ['LGC', 'LGA', 'LGM', 'LIC', 'LIA', 'LIM'],
  },
  {
    nome: 'Carlos Mendes', organizacao: 'ANEPC — Autoridade Nacional de Emergência e Proteção Civil',
    email: 'carlos.mendes@anepc-demo.pt', telefone: '+351910000002', interno: false,
    listas: ['LGC', 'LGA'],
  },
  {
    nome: 'Margarida Costa', organizacao: 'SRPCBA — Serviço Regional de Proteção Civil dos Açores',
    email: 'margarida.costa@srpcba-demo.pt', telefone: '+351910000003', interno: false,
    listas: ['LGA', 'LIA'],
  },
  {
    nome: 'Paulo Rodrigues', organizacao: 'SRPC Madeira',
    email: 'paulo.rodrigues@srpcmadeira-demo.pt', telefone: '+351910000004', interno: false,
    listas: ['LGM', 'LIM'],
  },
  {
    nome: 'Sofia Leal', organizacao: 'Governo da República — Ministério do Interior',
    email: 'sofia.leal@ministerio-demo.pt', telefone: '+351910000005', interno: false,
    listas: ['LGC', 'LGA', 'LGM'],
  },
  {
    nome: 'Ricardo Santos', organizacao: 'RTP — Rádio e Televisão de Portugal',
    email: 'ricardo.santos@rtp-demo.pt', telefone: '+351910000006', interno: false,
    listas: ['LGC'],
  },
  {
    nome: 'Inês Oliveira', organizacao: 'Lusa — Agência de Notícias de Portugal',
    email: 'ines.oliveira@lusa-demo.pt', telefone: '+351910000007', interno: false,
    listas: ['LGC', 'LGA'],
  },
];

// ---------------------------------------------------------------------------
async function main() {
  console.log('[seed-demo] A iniciar seed de dados de demonstração…');

  // 1. Utilizador administrador
  let admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin) {
    const hash = await bcrypt.hash(ADMIN_PASS, 12);
    admin = await prisma.user.create({
      data: {
        name: ADMIN_NOME,
        email: ADMIN_EMAIL,
        passwordHash: hash,
        role: 'ADMIN',
        active: true,
      },
    });
    console.log(`[seed-demo] Admin criado: ${ADMIN_EMAIL}`);
  } else if (admin.role !== 'ADMIN') {
    // Garantir que tem role ADMIN mesmo que já exista com outro role
    admin = await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: { role: 'ADMIN', active: true },
    });
    console.log(`[seed-demo] Admin promovido a ADMIN: ${ADMIN_EMAIL}`);
  } else {
    console.log(`[seed-demo] Admin já existe: ${ADMIN_EMAIL}`);
  }

  // 2. Utilizador de sistema
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

  // 3. SystemConfig
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg) {
    await prisma.systemConfig.create({
      data: {
        id: 'singleton',
        smtpFrom: 'sismos@ipma.pt',
        smsSender: 'IPMA',
        smsMode: 'test',
        emailRemetente: 'IPMA — Serviço de Sismologia',
        assinaturaTecnica: 'Instituto Português do Mar e da Atmosfera, I.P.',
        fusoHorario: 'UTC',
      },
    });
    console.log('[seed-demo] SystemConfig inicializado');
  }

  // 4. Destinatários de demonstração
  for (const d of DESTINATARIOS) {
    const existing = await prisma.destinatario.findFirst({ where: { email: d.email } });
    if (!existing) {
      const dest = await prisma.destinatario.create({
        data: {
          nome: d.nome,
          organizacao: d.organizacao,
          email: d.email,
          telefone: d.telefone,
          interno: d.interno,
        },
      });
      for (const lista of d.listas) {
        await prisma.destinatarioLista.create({
          data: { destinatarioId: dest.id, lista, ativo: true },
        });
      }
      console.log(`[seed-demo] Destinatário criado: ${d.nome}`);
    }
  }

  // 5. Comunicados de demonstração
  for (const s of SISMOS) {
    const existing = await prisma.comunicado.findUnique({ where: { referencia: s.referencia } });
    if (existing) {
      console.log(`[seed-demo] Já existe: ${s.referencia}`);
      continue;
    }

    const comunicado = await prisma.comunicado.create({
      data: {
        referencia: s.referencia,
        ano: s.ano,
        numeroAno: s.numeroAno,
        origem: 'MANUAL',
        templateId: '0001',
        estado: s.estado,
        primeiraPagina: s.estado === 'ENVIADO',
        ativo: true,
        titulo: s.titulo,
        texto: s.texto,
        local: s.local,
        areaName: s.areaName,
        eventDateTime: s.eventDateTime,
        lat: s.lat,
        lon: s.lon,
        depth: s.depth,
        magnitude: s.magnitude,
        intmax: s.intmax,
        regiaoIntmax: s.regiaoIntmax,
        smsListas: s.smsListas,
        emailListas: s.emailListas,
        criadoPorId: admin.id,
      },
    });

    for (const v of s.versoes) {
      await prisma.versao.create({
        data: {
          comunicadoId: comunicado.id,
          numero: v.numero,
          titulo: v.titulo,
          texto: v.texto,
          criadoPorId: admin.id,
        },
      });
    }
    console.log(`[seed-demo] Comunicado criado: ${s.referencia} (${s.versoes.length} versão/versões)`);
  }

  // 6. Sequência de referências
  const seq = await prisma.referenciaSequencia.findUnique({ where: { ano: 2026 } });
  await prisma.referenciaSequencia.upsert({
    where: { ano: 2026 },
    update: { ultimo: Math.max(seq?.ultimo ?? 0, 6) },
    create: { ano: 2026, ultimo: 6 },
  });

  console.log('[seed-demo] Seed concluído.');
}

main()
  .catch(e => console.error('[seed-demo] Erro:', e.message))
  .finally(() => prisma.$disconnect());
