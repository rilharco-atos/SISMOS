import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/***********************************************************************************************************************
* @class         PrismaModule
* @description   Global NestJS module that provides the Prisma database client to the entire application.
*                Marked @Global() so PrismaService is available in every module without explicit imports,
*                ensuring a single shared Prisma instance and connection pool across all providers.
*
* @responsibilities
*                 - Instantiate and export PrismaService as a singleton
*                 - Make PrismaService available application-wide without re-importing this module
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - @Global() removes the need to import PrismaModule in every feature module.
*                 - PrismaService extends PrismaClient and manages lifecycle hooks (onModuleInit/Destroy).
*
*               Notes for future enhancements:
*                 - Add read-replica support by providing a secondary PrismaService with its own connection.
***********************************************************************************************************************/
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
