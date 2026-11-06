import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface AuditEntry {
  userId: string;
  acao: string;
  entidade: string;
  entidadeId?: string;
  comunicadoId?: string;
  detalhes?: Record<string, any>;
  ipAddress?: string;
}

/***********************************************************************************************************************
* @class         AuditService
* @description   Injectable NestJS service that persists audit log entries for all significant platform
*                operations. Every state change is recorded here for compliance and traceability.
*
* @responsibilities
*                 - Persist audit log entries to the database with user, action and entity context
*                 - Retrieve recent audit log entries for the backoffice audit view
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - All services inject AuditService and call log() on every mutation.
*                 - The AuditModule is @Global() so AuditService is available without explicit imports.
*
*               Notes for future enhancements:
*                 - Add filtering and pagination to findAll for large audit logs.
***********************************************************************************************************************/
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /*********************************************************************************************************************
  * @method       log
  * @description  Persists a single audit log entry to the database. Fire-and-forget in most call sites;
  *               the caller should await when the audit record must exist before returning a response.
  * @param        entry — AuditEntry with userId, acao, entidade and optional context fields
  * @return       Resolved void promise
  *********************************************************************************************************************/
  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: entry.userId,
        acao: entry.acao,
        entidade: entry.entidade,
        entidadeId: entry.entidadeId,
        comunicadoId: entry.comunicadoId,
        detalhes: entry.detalhes as any,
        ipAddress: entry.ipAddress,
      },
    });
  }

  /*********************************************************************************************************************
  * @method       findAll
  * @description  Returns the most recent audit log entries ordered by creation date descending,
  *               including the name and email of the user who performed each action.
  * @param        limit — maximum number of entries to return (default 100)
  * @return       Array of audit log entries with embedded user name and email
  *********************************************************************************************************************/
  async findAll(limit = 100) {
    return this.prisma.auditLog.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { criadoEm: 'desc' },
      take: limit,
    });
  }
}
