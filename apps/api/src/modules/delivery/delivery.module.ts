import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';
import { ComunicadosModule } from '../comunicados/comunicados.module';
import { ListasModule } from '../listas/listas.module';

/***********************************************************************************************************************
* @class         DeliveryModule
* @description   NestJS module that encapsulates outbound delivery of seismic bulletins via e-mail and
*                SMS. Imports HttpModule for HTTPS-based e-mail providers (Resend, SendGrid), and depends
*                on ComunicadosModule and ListasModule to resolve bulletin content and recipient lists.
*
* @responsibilities
*                 - Register DeliveryService and DeliveryController
*                 - Import HttpModule (axios) for HTTP-based e-mail transports
*                 - Import ComunicadosModule and ListasModule as peer dependencies
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - DeliveryService supports SMTP (nodemailer), Resend and SendGrid as e-mail transports,
*                   selected at runtime from SettingsService.
*                 - SMS delivery uses SMSExpress MEO or Twilio adapters, also selected via SettingsService.
*
*               Notes for future enhancements:
*                 - Add a delivery-status webhook endpoint to capture bounce/delivery events from providers.
***********************************************************************************************************************/
@Module({
  imports: [HttpModule, ComunicadosModule, ListasModule],
  controllers: [DeliveryController],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
