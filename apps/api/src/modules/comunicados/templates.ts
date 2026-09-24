import { formatInZone, zoneForArea } from '../../common/tz.util';

/**
 * Templates de comunicado. Identificadores e textos reproduzidos exatamente como fornecidos
 * pelo IPMA (assessment funcional, secção 7). NÃO ALTERAR o conteúdo dos textos.
 */
export const TEMPLATE_IDS = ['0000', '0001', '0002', '0003', '0004', '0005', '0006', '0007'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

const RODAPE_PADRAO =
  'A localização do epicentro de um sismo é um processo físico e matemático complexo que depende do conjunto de dados, dos algoritmos e dos modelos de propagação das ondas sísmicas. Agências diferentes podem produzir resultados ligeiramente diferentes. Do mesmo modo, as determinações preliminares são habitualmente corrigidas posteriormente, pela integração de mais informação.\n\nEm todos os casos acompanhe sempre as indicações dos serviços de proteção civil.\n\nToda e qualquer utilização do conteúdo deste comunicado deverá sempre fazer referência à fonte.';

const ABERTURA =
  'O Instituto Português do Mar e da Atmosfera informa que no dia [dd-mm-aaaa] pelas [hh:mm] (hora local) foi registado nas estações da Rede Sísmica do [zona] , um sismo de magnitude {m.m] (Richter) e cujo epicentro se localizou [referência geográfica] .';

export const TEMPLATES: Record<TemplateId, { label: string; texto: string }> = {
  '0000': {
    label: 'Genérico',
    texto:
      '[--- EDITAR TEXTO ---]\n\nSe a situação o justificar serão emitidos novos comunicados.\n\nSugere-se o acompanhamento da evolução da situação através da página do IPMA na Internet (www.ipma.pt) e a obtenção de eventuais recomendações junto da Autoridade Nacional de Proteção Civil (https://prociv.gov.pt/pt/home/), Serviço Regional de Proteção Civil (https://www.procivmadeira.pt/pt/) ou do Serviço Regional de Proteção Civil e Bombeiros (https://www.prociv.azores.gov.pt/).',
  },
  '0001': {
    label: 'Suspeito de sismo sentido',
    texto: `${ABERTURA}\n\nAté à elaboração deste comunicado não foi recebida nenhuma informação confirmando que este sismo tenha sido sentido.\n\nSe a situação o justificar serão emitidos novos comunicados.\n\n${RODAPE_PADRAO}`,
  },
  '0002': {
    label: 'Comunicado preliminar',
    texto: `${ABERTURA}\n\nDe acordo com a informação disponível, este sismo foi sentido, devendo em breve ser emitido novo comunicado com informação instrumental e macrossímica atualizada.\n\nSe a situação o justificar serão emitidos novos comunicados.\n\n${RODAPE_PADRAO}`,
  },
  '0003': {
    label: 'II – IV comunicado',
    texto: `${ABERTURA}\n\nEste sismo, de acordo com a informação disponível até ao momento, não causou danos pessoais ou materiais e foi sentido com [--info macrossísmica detalhada--] .\n\n${RODAPE_PADRAO}`,
  },
  '0004': {
    label: 'V comunicado',
    texto: `${ABERTURA}\n\nDe acordo com a informação disponível até ao momento, este sismo não causou danos pessoais ou materiais tendo sido fortemente sentido na região de [zonas de int max] , atingindo uma intensidade máxima de [intmax] . [--mais info macrossísmica complementar detalhada--] .\n\n${RODAPE_PADRAO}`,
  },
  '0005': {
    label: 'VI comunicado',
    texto: `${ABERTURA}\n\nEste sismo, de acordo com a informação disponível até ao momento, foi bastante forte tendo sentido com intensidade máxima [IntMax] (escala de Mercalli modificada) na região de [zonas de int max ] e causou consideráveis estragos nas construções de média qualidade. Poderão ocorrer réplicas pelo que se aconselha estar atento à queda de objetos, estuques ou tijolos, bem como afastar-se de janelas, vidros ou chaminé e procurar abrigar-se num lugar seguro, como, por exemplo, o vão de uma porta interior firmemente alicerçada ou debaixo de uma mesa robusta.\n\nSe a situação o justificar serão emitidos novos comunicados.\n\n${RODAPE_PADRAO}`,
  },
  '0006': {
    label: 'VII – VIII comunicado',
    texto: `${ABERTURA}\n\nEste sismo, de acordo com a informação disponível até ao momento, foi muito forte tendo sido sentido com intensidade máxima [IntMax] (escala de Mercalli modificada) na região de [zonas de int max ] e causou consideráveis estragos nas construções de média qualidade. Poderão ocorrer réplicas pelo que se aconselha estar atento à queda de objectos, estuques ou tijolos, bem como afastar-se de janelas, vidros ou chaminé e procurar abrigar-se num lugar seguro, como, por exemplo, o vão de uma porta interior firmemente alicerçada ou debaixo de uma mesa robusta..\n\nSe a situação o justificar serão emitidos novos comunicados.\n\n${RODAPE_PADRAO}`,
  },
  '0007': {
    label: 'IX comunicado',
    texto: `${ABERTURA}\n\nDe acordo com a informação disponível até ao momento, este sismo causou importantes destruições sendo de prever réplicas que possam atingir intensidades consideráveis pelo que se aconselha a desligar o gás, a eletricidade e a água, e a não utilizar elevadores e a procurar refúgio com serenidade, numa área aberta, longe de edifícios ou de estruturas que possam desabar. Igualmente se aconselha a não utilizar inutilmente o telefone, não circular de carro e a não reocupar edifícios com grandes estragos.\n\nSe a situação o justificar serão emitidos novos comunicados.\n\n${RODAPE_PADRAO}`,
  },
};

/** Designação da rede sísmica por área, usada no marcador [zona] ("Rede Sísmica do [zona]"). */
const ZONA_POR_AREA: Record<string, string> = {
  Continente: 'Continente',
  'Açores': 'Arquipélago dos Açores',
  Madeira: 'Arquipélago da Madeira',
};

export interface TemplateData {
  areaName?: string;
  eventDateTime?: Date | null;
  magnitude?: number | null;
  local?: string | null;
  intmax?: string | null;
  regiaoIntmax?: string | null;
  infoMacrossAdicional?: string | null;
}

const MARCADOR_POR_PREENCHER = /\[[^\]\n]*\]|\{m\.m\]/;

/** Marcadores que ficaram por preencher no texto (p.ex. "[--info macrossísmica detalhada--]"). */
export function marcadoresPorPreencher(texto: string): string[] {
  return texto.match(new RegExp(MARCADOR_POR_PREENCHER, 'g')) ?? [];
}

/**
 * Decide se um comunicado criado pelo fluxo automático pode ser enviado sem revisão:
 * exige texto sem marcadores por preencher e pelo menos uma lista de destino.
 */
export function avaliarEnvioAutomatico(texto: string, emailListas: string[], smsListas: string[]): { enviar: boolean; motivo?: string } {
  const faltam = marcadoresPorPreencher(texto);
  if (faltam.length) return { enviar: false, motivo: `Texto com marcadores por preencher: ${[...new Set(faltam)].join(', ')}` };
  if (!emailListas.length && !smsListas.length) return { enviar: false, motivo: 'XML sem listas de destino (emailKey/smsKey)' };
  return { enviar: true };
}

/** Devolve true se o identificador corresponde a um template conhecido. */
export function isTemplateId(id: string): id is TemplateId {
  return (TEMPLATE_IDS as readonly string[]).includes(id);
}

/**
 * Preenche os marcadores do template com os dados do evento.
 * Marcadores sem dado disponível ficam intactos para o analista completar.
 */
export function preencherTemplate(templateId: string, d: TemplateData): string {
  const tpl = isTemplateId(templateId) ? TEMPLATES[templateId] : TEMPLATES['0000'];
  const zone = zoneForArea(d.areaName);
  const has = (v: unknown) => v != null && String(v).trim() !== '';

  const valores: [RegExp, string | null][] = [
    [/\[dd-mm-aaaa\]/g, d.eventDateTime ? formatInZone(d.eventDateTime, zone, 'dd-mm-aaaa') : null],
    [/\[hh:mm\]/g, d.eventDateTime ? formatInZone(d.eventDateTime, zone, 'hh:mm') : null],
    [/\[zona\]/g, has(d.areaName) ? ZONA_POR_AREA[d.areaName!] ?? d.areaName! : null],
    [/\{m\.m\]/g, has(d.magnitude) ? Number(d.magnitude).toFixed(1) : null],
    [/\[referência geográfica\]/g, has(d.local) ? d.local! : null],
    [/\[zonas de int max\s*\]/g, has(d.regiaoIntmax) ? d.regiaoIntmax! : null],
    [/\[intmax\]/gi, has(d.intmax) ? d.intmax! : null],
    [/\[--info macrossísmica detalhada--\]/g, has(d.infoMacrossAdicional) ? d.infoMacrossAdicional! : null],
    [/\[--mais info macrossísmica complementar detalhada--\]/g, has(d.infoMacrossAdicional) ? d.infoMacrossAdicional! : null],
  ];

  let texto = tpl.texto;
  for (const [re, valor] of valores) {
    if (valor == null) continue;
    texto = texto.replace(re, () => `${valor}\u0000`);
  }
  // Remove o espaço antes da pontuação que segue um marcador já substituído.
  return texto.replace(/\u0000 ([,.])/g, '$1').replace(/\u0000/g, '');
}
