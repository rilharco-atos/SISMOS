import { Module } from '@nestjs/common';
import { ListasController } from './listas.controller';
import { ListasService } from './listas.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ListasController],
  providers: [ListasService],
  exports: [ListasService],
})
export class ListasModule {}
