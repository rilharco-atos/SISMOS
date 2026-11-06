import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/***********************************************************************************************************************
* @class         AuditModule
* @description   Global NestJS module that provides the audit-log service to the entire application.
*                Every domain operation that mutates state (create, update, approve, cancel, deliver)
*                injects AuditService to persist a tamper-evident record of the action.
*
* @responsibilities
*                 - Instantiate and export AuditService as a singleton
*                 - Make AuditService available application-wide without explicit module imports
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - @Global() avoids circular or repeated imports when many modules need audit logging.
*                 - Audit records are stored in the AuditLog table via PrismaService (injected from global PrismaModule).
*
*               Notes for future enhancements:
*                 - Stream audit events to an external SIEM (e.g. Elastic/Splunk) via an async side-channel.
***********************************************************************************************************************/
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
