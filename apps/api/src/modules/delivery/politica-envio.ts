export interface DestinatarioEnvio {
  id: string;
  email?: string | null;
  telefone?: string | null;
  interno?: boolean;
}

export const PREFIXO_ASSUNTO_TESTE = '[TESTE] ';

/**
 * Em modo teste só os contactos marcados como internos do IPMA recebem (nos seus próprios endereços);
 * em produção recebem todos os destinatários ativos da lista.
 */
export function elegivel(d: DestinatarioEnvio, modo: 'test' | 'production'): boolean {
  return modo === 'production' || d.interno === true;
}

/** Chave de deduplicação: um destinatário em várias listas recebe uma única mensagem. */
export function chaveEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function chaveTelefone(telefone: string): string {
  const digitos = telefone.replace(/[^\d+]/g, '');
  return digitos.startsWith('+') ? digitos : digitos.length === 9 ? `+351${digitos}` : digitos;
}
