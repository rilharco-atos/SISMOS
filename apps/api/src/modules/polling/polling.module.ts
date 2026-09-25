import { Module } from '@nestjs/common';
import { PollingService } from './polling.service';
import { PollingController } from './polling.controller';
import { ComunicadosModule } from '../comunicados/comunicados.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [ComunicadosModule, DeliveryModule, AuditModule],
  controllers: [PollingController],
  providers: [PollingService],
  exports: [PollingService],
})
export class PollingModule {}
