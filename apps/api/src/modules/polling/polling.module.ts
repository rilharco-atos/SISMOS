import { Module } from '@nestjs/common';
import { PollingService } from './polling.service';
import { ComunicadosModule } from '../comunicados/comunicados.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [ComunicadosModule, DeliveryModule, AuditModule],
  providers: [PollingService],
  exports: [PollingService],
})
export class PollingModule {}
