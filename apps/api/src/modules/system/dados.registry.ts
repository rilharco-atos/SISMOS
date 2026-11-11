/***********************************************************************************************************************
* @file          dados.registry.ts
* @description   Whitelist of the database tables exposed read-only in the backoffice "Dados" tab. Each entry
*                declares the Prisma delegate, the ordering, the searchable fields and the visible columns.
*                Only columns listed here can ever leave the API: secrets, password hashes, binary content,
*                full texts and XML sources are deliberately absent, and personal contacts are masked.
*
* @lastupdate    09/11/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       SystemConfig is intentionally not exposed (holds FTP/SMTP passwords and the ingest API key);
*                it is managed in the Configurações tab. Ficheiro exposes metadata only (never conteudo).
***********************************************************************************************************************/

export enum TipoColuna {
  TEXTO = 'texto',
  MONO = 'mono',
  NUMERO = 'numero',
  BOOLEANO = 'booleano',
  DATA = 'data',
  BADGE = 'badge',
  JSON = 'json',
  OCULTO = 'oculto',
}

export enum Mascara {
  EMAIL = 'email',
  TELEFONE = 'telefone',
}

export interface ColunaDados {
  /** Field name; dotted path (e.g. "criadoPor.name") reads a one-level relation. */
  key: string;
  label: string;
  tipo: TipoColuna;
  mascara?: Mascara;
}

export interface TabelaDados {
  key: string;
  label: string;
  delegate: string;
  orderBy: Record<string, 'asc' | 'desc'>[];
  pesquisa: string[];
  colunas: ColunaDados[];
}

const c = (key: string, label: string, tipo: TipoColuna = TipoColuna.TEXTO, mascara?: Mascara): ColunaDados => ({ key, label, tipo, mascara });

export const TABELAS_DADOS: TabelaDados[] = [
  {
    key: 'comunicados', label: 'Comunicados', delegate: 'comunicado',
    orderBy: [{ criadoEm: 'desc' }, { id: 'asc' }],
    pesquisa: ['referencia', 'titulo', 'local', 'areaName'],
    colunas: [
      c('id', 'id', TipoColuna.OCULTO),
      c('referencia', 'Referência', TipoColuna.MONO), c('titulo', 'Título'), c('estado', 'Estado', TipoColuna.BADGE),
      c('origem', 'Origem'), c('areaName', 'Área'), c('local', 'Local'), c('magnitude', 'Mag.', TipoColuna.NUMERO),
      c('intmax', 'Int. máx.'), c('eventDateTime', 'Data do evento', TipoColuna.DATA), c('websiteEstado', 'Website'),
      c('ativo', 'Ativo', TipoColuna.BOOLEANO), c('criadoPor.name', 'Criado por'), c('criadoEm', 'Criado em', TipoColuna.DATA),
    ],
  },
  {
    key: 'versoes', label: 'Versões', delegate: 'versao',
    orderBy: [{ criadoEm: 'desc' }, { id: 'asc' }],
    pesquisa: ['titulo'],
    colunas: [
      c('comunicado.referencia', 'Comunicado', TipoColuna.MONO), c('numero', 'Versão', TipoColuna.NUMERO), c('titulo', 'Título'),
      c('pdfPath', 'PDF', TipoColuna.MONO), c('criadoEm', 'Criado em', TipoColuna.DATA),
    ],
  },
  {
    key: 'destinatarios', label: 'Destinatários', delegate: 'destinatario',
    orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    pesquisa: ['nome', 'organizacao'],
    colunas: [
      c('nome', 'Nome'), c('organizacao', 'Organização'), c('email', 'Email (mascarado)', TipoColuna.MONO, Mascara.EMAIL),
      c('telefone', 'Telefone (mascarado)', TipoColuna.MONO, Mascara.TELEFONE), c('interno', 'Interno', TipoColuna.BOOLEANO),
      c('criadoEm', 'Criado em', TipoColuna.DATA),
    ],
  },
  {
    key: 'destinatarios-listas', label: 'Pertença a listas', delegate: 'destinatarioLista',
    orderBy: [{ lista: 'asc' }, { destinatarioId: 'asc' }],
    pesquisa: [],
    colunas: [c('lista', 'Lista', TipoColuna.BADGE), c('destinatario.nome', 'Destinatário'), c('ativo', 'Ativo', TipoColuna.BOOLEANO)],
  },
  {
    key: 'emails-enviados', label: 'Envios de email', delegate: 'emailEnvio',
    orderBy: [{ enviadoEm: 'desc' }, { id: 'asc' }],
    pesquisa: ['erro'],
    colunas: [
      c('versao.comunicado.referencia', 'Comunicado', TipoColuna.MONO), c('lista', 'Lista', TipoColuna.BADGE),
      c('totalEnviado', 'Enviados', TipoColuna.NUMERO), c('totalFalha', 'Falhas', TipoColuna.NUMERO),
      c('sucesso', 'Sucesso', TipoColuna.BOOLEANO), c('erro', 'Erro'), c('enviadoEm', 'Enviado em', TipoColuna.DATA),
    ],
  },
  {
    key: 'sms-enviados', label: 'Envios de SMS', delegate: 'smsEnvio',
    orderBy: [{ enviadoEm: 'desc' }, { id: 'asc' }],
    pesquisa: ['mensagem', 'erro'],
    colunas: [
      c('versao.comunicado.referencia', 'Comunicado', TipoColuna.MONO), c('lista', 'Lista', TipoColuna.BADGE), c('mensagem', 'Mensagem'),
      c('totalEnviado', 'Enviados', TipoColuna.NUMERO), c('totalFalha', 'Falhas', TipoColuna.NUMERO),
      c('sucesso', 'Sucesso', TipoColuna.BOOLEANO), c('erro', 'Erro'), c('enviadoEm', 'Enviado em', TipoColuna.DATA),
    ],
  },
  {
    key: 'auditoria', label: 'Auditoria', delegate: 'auditLog',
    orderBy: [{ criadoEm: 'desc' }, { id: 'asc' }],
    pesquisa: ['acao', 'entidade', 'entidadeId'],
    colunas: [
      c('criadoEm', 'Data', TipoColuna.DATA), c('user.name', 'Utilizador'), c('acao', 'Ação', TipoColuna.BADGE),
      c('entidade', 'Entidade'), c('entidadeId', 'ID da entidade', TipoColuna.MONO), c('detalhes', 'Detalhes', TipoColuna.JSON),
      c('ipAddress', 'IP', TipoColuna.MONO),
    ],
  },
  {
    key: 'utilizadores', label: 'Utilizadores', delegate: 'user',
    orderBy: [{ criadoEm: 'desc' }, { id: 'asc' }],
    pesquisa: ['name', 'email'],
    colunas: [
      c('name', 'Nome'), c('email', 'Email', TipoColuna.MONO), c('role', 'Perfil', TipoColuna.BADGE),
      c('active', 'Ativo', TipoColuna.BOOLEANO), c('criadoEm', 'Criado em', TipoColuna.DATA),
    ],
  },
  {
    key: 'estado-componentes', label: 'Estado dos componentes', delegate: 'estadoComponente',
    orderBy: [{ componente: 'asc' }],
    pesquisa: ['componente', 'mensagemErro'],
    colunas: [
      c('componente', 'Componente', TipoColuna.MONO), c('ultimoSucesso', 'Último sucesso', TipoColuna.DATA),
      c('ultimoErro', 'Último erro', TipoColuna.DATA), c('mensagemErro', 'Mensagem de erro'), c('atualizadoEm', 'Atualizado em', TipoColuna.DATA),
    ],
  },
  {
    key: 'referencias', label: 'Sequência de referências', delegate: 'referenciaSequencia',
    orderBy: [{ ano: 'desc' }],
    pesquisa: [],
    colunas: [c('ano', 'Ano', TipoColuna.NUMERO), c('ultimo', 'Último número', TipoColuna.NUMERO)],
  },
  {
    key: 'ficheiros', label: 'Ficheiros (metadados)', delegate: 'ficheiro',
    orderBy: [{ criadoEm: 'desc' }, { chave: 'asc' }],
    pesquisa: ['chave', 'contentType'],
    colunas: [
      c('chave', 'Chave', TipoColuna.MONO), c('contentType', 'Tipo'), c('tamanho', 'Tamanho (bytes)', TipoColuna.NUMERO),
      c('criadoEm', 'Criado em', TipoColuna.DATA),
    ],
  },
];

/*********************************************************************************************************************
* @method       construirSelect
* @description  Builds a Prisma select object from the dotted column keys of a table, so only whitelisted
*               columns (and the relation fields they need) are fetched from the database.
* @param        colunas — columns declared for the table
* @return       Nested Prisma select object
*********************************************************************************************************************/
export function construirSelect(colunas: ColunaDados[]): Record<string, any> {
  const select: Record<string, any> = {};
  for (const { key } of colunas) {
    let no = select;
    const partes = key.split('.');
    partes.forEach((parte, i) => {
      if (i === partes.length - 1) no[parte] = true;
      else { no[parte] = no[parte] && no[parte] !== true ? no[parte] : { select: {} }; no = no[parte].select; }
    });
  }
  return select;
}

/*********************************************************************************************************************
* @method       valorPorCaminho
* @description  Reads a possibly nested value using a dotted path; returns null when any step is missing.
* @param        obj — row returned by Prisma
* @param        caminho — dotted path such as "versao.comunicado.referencia"
* @return       The value found, or null
*********************************************************************************************************************/
export function valorPorCaminho(obj: any, caminho: string): any {
  return caminho.split('.').reduce((acc, k) => (acc == null ? null : acc[k]), obj) ?? null;
}
