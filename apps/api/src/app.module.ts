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
  ],
})
export class AppModule {}
