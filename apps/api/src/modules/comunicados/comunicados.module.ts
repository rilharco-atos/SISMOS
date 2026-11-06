import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ComunicadosController } from './comunicados.controller';
import { ComunicadosService } from './comunicados.service';
import { XmlParserService } from './xml-parser.service';
import { PdfService } from './pdf.service';
import { ReferenciaService } from './referencia.service';
import { AuditModule } from '../audit/audit.module';

/***********************************************************************************************************************
* @class         ComunicadosModule
* @description   NestJS module that implements the core domain of the IPMA Seismic Bulletins platform. It
*                manages the lifecycle of seismic bulletins from creation through approval, delivery and
*                archiving, including XML ingestion, PDF generation and template substitution.
*
* @responsibilities
*                 - Register ComunicadosController to expose bulletin REST endpoints
*                 - Provide ComunicadosService, XmlParserService, PdfService and ReferenciaService
*                 - Configure MulterModule with in-memory storage for file upload handling
*                 - Export ComunicadosService and PdfService for use by PollingModule, DeliveryModule and IngestModule
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - MulterModule uses memoryStorage so uploaded files never touch the filesystem.
*                 - AuditModule is imported explicitly because ComunicadosModule records every state change.
*
*               Notes for future enhancements:
*                 - Consider a dedicated TemplatesModule to decouple template management from bulletin CRUD.
***********************************************************************************************************************/
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
