import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';
import { ListasModule } from '../listas/listas.module';
import { ComunicadosModule } from '../comunicados/comunicados.module';

@Module({
  imports: [HttpModule, ListasModule, ComunicadosModule],
  controllers: [DeliveryController],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
