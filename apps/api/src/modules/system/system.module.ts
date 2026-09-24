import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { AuditModule } from '../audit/audit.module';
import { PollingModule } from '../polling/polling.module';

@Module({
  imports: [AuditModule, PollingModule],
  controllers: [SystemController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule {}
