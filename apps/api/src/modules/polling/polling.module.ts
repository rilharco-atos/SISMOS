import { Module } from '@nestjs/common';
import { PollingService } from './polling.service';
import { PollingController } from './polling.controller';
import { ComunicadosModule } from '../comunicados/comunicados.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { AuditModule } from '../audit/audit.module';

/***********************************************************************************************************************
* @class         PollingModule
* @description   NestJS module that manages scheduled FTP polling for incoming seismic bulletin XML files.
*                Coordinates the full ingestion pipeline: connect to FTP, download pending files, parse,
*                create bulletins and trigger automatic delivery when configured.
*
* @responsibilities
*                 - Register PollingController to expose a manual trigger endpoint
*                 - Provide PollingService which owns the @Cron-scheduled FTP polling cycle
*                 - Import ComunicadosModule, DeliveryModule and AuditModule as peer dependencies
*                 - Export PollingService so SystemModule can invoke a manual poll on demand
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - The polling interval and FTP credentials are read from SettingsService at each tick.
*                 - PollingModule depends on ComunicadosModule and DeliveryModule — declare it after them in AppModule.
*
*               Notes for future enhancements:
*                 - Add dead-letter handling for XML files that fail parsing more than N times.
***********************************************************************************************************************/
@Module({
  imports: [ComunicadosModule, DeliveryModule, AuditModule],
  controllers: [PollingController],
  providers: [PollingService],
  exports: [PollingService],
})
export class PollingModule {}
