import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { AuditModule } from '../audit/audit.module';
import { PollingModule } from '../polling/polling.module';

/***********************************************************************************************************************
* @class         SystemModule
* @description   NestJS module that exposes back-office system-administration capabilities including health
*                checks, configuration management, SMTP and FTP connectivity tests, on-demand polling
*                triggers and audit-log retrieval.
*
* @responsibilities
*                 - Register SystemController to expose admin-only REST endpoints
*                 - Provide SystemService for configuration, health and connectivity operations
*                 - Import AuditModule to persist configuration-change audit events
*                 - Import PollingModule so administrators can trigger a manual FTP poll
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - All SystemController endpoints require JwtAuthGuard — no public routes.
*                 - PollingModule is imported here to allow on-demand execution; the scheduled cron stays in PollingService.
*
*               Notes for future enhancements:
*                 - Add a /system/backup endpoint for on-demand database backup downloads.
***********************************************************************************************************************/
@Module({
  imports: [AuditModule, PollingModule],
  controllers: [SystemController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule {}
