import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ComunicadosController } from './comunicados.controller';
import { ComunicadosService } from './comunicados.service';
import { XmlParserService } from './xml-parser.service';
import { PdfService } from './pdf.service';
import { ReferenciaService } from './referencia.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
    AuditModule,
  ],
  controllers: [ComunicadosController],
  providers: [ComunicadosService, XmlParserService, PdfService, ReferenciaService],
  exports: [ComunicadosService, PdfService],
})
export class ComunicadosModule {}
