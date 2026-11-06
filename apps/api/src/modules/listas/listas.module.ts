import { Module } from '@nestjs/common';
import { ListasController } from './listas.controller';
import { ListasService } from './listas.service';

/***********************************************************************************************************************
* @class         ListasModule
* @description   NestJS module that manages the distribution-list data for the seismic bulletin platform.
*                Exposes CRUD operations for recipients (destinatários) across the six distribution lists
*                (LGA, LIA, LGM, LIM, LGC, LIC) and exports ListasService for use by DeliveryModule.
*
* @responsibilities
*                 - Register ListasController to expose recipient-management REST endpoints
*                 - Provide and export ListasService so DeliveryModule can resolve recipient addresses
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - PII masking (e-mail/phone partial redaction) is applied in list-read responses;
*                   DeliveryService calls the raw-read method that bypasses masking.
*                 - PrismaService is injected from the global PrismaModule.
*
*               Notes for future enhancements:
*                 - Add bulk CSV import for initial population of distribution lists.
***********************************************************************************************************************/
@Module({
  controllers: [ListasController],
  providers: [ListasService],
  exports: [ListasService],
})
export class ListasModule {}
