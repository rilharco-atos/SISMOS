import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from './storage.service';

/***********************************************************************************************************************
* @class         StorageModule
* @description   Global NestJS module that provides the StorageService singleton for persisting and
*                retrieving binary attachments (PDF files, images). The active storage driver (database
*                BYTEA or S3-compatible object store) is resolved from the environment configuration.
*
* @responsibilities
*                 - Instantiate StorageService via a factory provider so PrismaService is injected correctly
*                 - Make StorageService available application-wide without explicit module imports
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - @Global() allows ComunicadosModule, DeliveryModule and PdfService to inject StorageService
*                   without importing StorageModule.
*                 - The factory provider is required because StorageService needs PrismaService from the global
*                   PrismaModule at construction time.
*
*               Notes for future enhancements:
*                 - Add a CDN driver for high-traffic public assets.
***********************************************************************************************************************/
@Global()
@Module({
  providers: [{ provide: StorageService, useFactory: (prisma: PrismaService) => new StorageService(prisma), inject: [PrismaService] }],
  exports: [StorageService],
})
export class StorageModule {}
