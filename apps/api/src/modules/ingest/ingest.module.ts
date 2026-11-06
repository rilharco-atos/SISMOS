import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IngestController } from './ingest.controller';
import { IngestApiKeyGuard } from './api-key.guard';
import { ComunicadosModule } from '../comunicados/comunicados.module';
import { AuditModule } from '../audit/audit.module';
import { PollingModule } from '../polling/polling.module';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
    ComunicadosModule,
    AuditModule,
    PollingModule,
  ],
  controllers: [IngestController],
  providers: [IngestApiKeyGuard],
})
export class IngestModule {}
