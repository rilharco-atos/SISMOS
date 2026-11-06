import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { anoLisboa } from '../../common/tz.util';

export const REFERENCIA_PREFIXO = 'SISM';

export interface Referencia {
  referencia: string;
  ano: number;
  numeroAno: number;
}

/*********************************************************************************************************************
* @method       formatarReferencia
* @description  Formats the public bulletin reference string in the canonical IPMA format:
*               SISM-YYYY-NNNN (e.g. SISM-2026-0001).
* @param        ano — four-digit year
* @param        numero — sequential number within the year
* @return       Formatted reference string
*********************************************************************************************************************/
export function formatarReferencia(ano: number, numero: number): string {
  return `${REFERENCIA_PREFIXO}-${ano}-${String(numero).padStart(4, '0')}`;
}

/***********************************************************************************************************************
* @class         ReferenciaService
* @description   Injectable NestJS service that generates atomic sequential bulletin reference numbers
*                for the current Lisbon calendar year.
*
* @responsibilities
*                 - Assign the next sequential number within the year using a PostgreSQL upsert
*                 - Ensure no gaps in the sequence when run within the bulletin creation transaction
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Must run inside the same Prisma transaction that creates the bulletin record.
*                 - On the first use of a new year, seeds from the highest existing numeroAno to handle
*                   migrated data from prior systems.
***********************************************************************************************************************/
@Injectable()
export class ReferenciaService {
  /*********************************************************************************************************************
  * @method       proxima
  * @description  Assigns the next sequential number for the current Lisbon year atomically via a
  *               PostgreSQL INSERT … ON CONFLICT DO UPDATE. Must be called within a Prisma transaction.
  * @param        tx — Prisma transaction client for atomic execution
  * @param        agora — reference timestamp (default: now) used to determine the Lisbon year
  * @return       Promise resolving to a Referencia with formatted string, year and sequence number
  * @uses         anoLisboa, formatarReferencia
  *********************************************************************************************************************/
  async proxima(tx: Prisma.TransactionClient, agora = new Date()): Promise<Referencia> {
    const ano = anoLisboa(agora);
    const rows = await tx.$queryRaw<{ ultimo: number }[]>`
      INSERT INTO "ReferenciaSequencia" ("ano", "ultimo")
      VALUES (${ano}, COALESCE((SELECT MAX("numeroAno") FROM "Comunicado" WHERE "ano" = ${ano}), 0) + 1)
      ON CONFLICT ("ano") DO UPDATE SET "ultimo" = "ReferenciaSequencia"."ultimo" + 1
      RETURNING "ultimo"`;
    const numeroAno = Number(rows[0].ultimo);
    return { referencia: formatarReferencia(ano, numeroAno), ano, numeroAno };
  }
}
