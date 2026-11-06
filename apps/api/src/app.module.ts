import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './modules/settings/settings.module';
import { StorageModule } from './modules/storage/storage.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { WebsiteModule } from './modules/website/website.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ComunicadosModule } from './modules/comunicados/comunicados.module';
import { ListasModule } from './modules/listas/listas.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { PollingModule } from './modules/polling/polling.module';
import { AuditModule } from './modules/audit/audit.module';
import { SystemModule } from './modules/system/system.module';
import { IngestModule } from './modules/ingest/ingest.module';

/***********************************************************************************************************************
* @class         AppModule
* @description   Root NestJS application module for the IPMA Seismic Bulletins platform. Wires every
*                feature module into the application container and activates global infrastructure:
*                configuration, scheduling, observability, storage, and application settings.
*
* @responsibilities
*                 - Register every feature module in dependency order (infrastructure → domain → API)
*                 - Enable NestJS ConfigModule globally so all providers can inject ConfigService
*                 - Enable NestJS ScheduleModule to support the FTP polling cron job
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Global modules (PrismaModule, ObservabilityModule, SettingsModule, StorageModule,
*                   WebsiteModule) are declared @Global() in their own files and only registered here.
*                 - PollingModule and IngestModule must appear after ComunicadosModule and DeliveryModule
*                   because they inject services from those modules.
*
*               Notes for future enhancements:
*                 - Consider a dedicated HealthModule if liveness/readiness probes need their own router.
***********************************************************************************************************************/
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    ObservabilityModule,
    SettingsModule,
    WebsiteModule,
    AuthModule,
    UsersModule,
    ComunicadosModule,
    ListasModule,
    DeliveryModule,
    PollingModule,
    AuditModule,
    SystemModule,
    IngestModule,
  ],
})
export class AppModule {}
