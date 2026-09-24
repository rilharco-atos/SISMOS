import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { anoLisboa } from '../../common/tz.util';

export const REFERENCIA_PREFIXO = 'SISM';

export interface Referencia {
  referencia: string;
  ano: number;
  numeroAno: number;
}

/** Formata a referência pública: SISM-2026-0001. */
export function formatarReferencia(ano: number, numero: number): string {
  return `${REFERENCIA_PREFIXO}-${ano}-${String(numero).padStart(4, '0')}`;
}

@Injectable()
export class ReferenciaService {
  /**
   * Atribui o próximo número do ano (hora de Lisboa) de forma atómica.
   * Deve correr dentro da mesma transação que cria o comunicado, para não deixar buracos.
   * Na primeira utilização de um ano continua a partir do maior número já existente (dados migrados).
   */
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
