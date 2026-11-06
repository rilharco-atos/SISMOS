export interface DestinatarioEnvio {
  id: string;
  email?: string | null;
  telefone?: string | null;
  interno?: boolean;
}

export const PREFIXO_ASSUNTO_TESTE = '[TESTE] ';

/*********************************************************************************************************************
* @method       elegivel
* @description  Determines whether a recipient should receive the bulletin in the given mode.
*               In test mode only contacts marked as internal IPMA recipients receive messages;
*               in production mode all active recipients in the list receive them.
* @param        d — DestinatarioEnvio with the interno flag
* @param        modo — 'test' or 'production' dispatch mode
* @return       true when the recipient should receive a message
*********************************************************************************************************************/
export function elegivel(d: DestinatarioEnvio, modo: 'test' | 'production'): boolean {
  return modo === 'production' || d.interno === true;
}

/*********************************************************************************************************************
* @method       chaveEmail
* @description  Returns the deduplication key for an email address. A recipient present in multiple
*               lists receives only one message per dispatch.
* @param        email — raw email address string
* @return       Normalised lowercase trimmed email string
*********************************************************************************************************************/
export function chaveEmail(email: string): string {
  return email.trim().toLowerCase();
}

/*********************************************************************************************************************
* @method       chaveTelefone
* @description  Returns the deduplication key for a phone number. Normalises 9-digit Portuguese
*               numbers to E.164 format (+351XXXXXXXXX).
* @param        telefone — raw phone number string
* @return       Normalised phone number string with digits and leading + only
*********************************************************************************************************************/
export function chaveTelefone(telefone: string): string {
  const digitos = telefone.replace(/[^\d+]/g, '');
  return digitos.startsWith('+') ? digitos : digitos.length === 9 ? `+351${digitos}` : digitos;
}
