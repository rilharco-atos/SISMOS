import { Global, Module } from '@nestjs/common';
import { WebsiteService } from './website.service';
import { AuditModule } from '../audit/audit.module';

/***********************************************************************************************************************
* @class         WebsiteModule
* @description   Global NestJS module that encapsulates integration with the IPMA public website. Provides
*                WebsiteService for publishing and removing approved seismic bulletins from the website
*                using the configured publishing driver (HTTP, filesystem or no-op).
*
* @responsibilities
*                 - Instantiate and export WebsiteService as a singleton available application-wide
*                 - Import AuditModule to record every publish and remove operation
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - @Global() makes WebsiteService injectable everywhere without explicit module imports.
*                 - The active publisher (NoopPublisher, HttpPublisher or FicheiroPublisher) is resolved at
*                   runtime in WebsiteService based on the environment configuration.
*
*               Notes for future enhancements:
*                 - Add a retry policy for transient HTTP failures when publishing to the IPMA website.
***********************************************************************************************************************/
@Global()
@Module({
  imports: [AuditModule],
  providers: [WebsiteService],
  exports: [WebsiteService],
})
export class WebsiteModule {}
