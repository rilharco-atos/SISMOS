import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service';

/***********************************************************************************************************************
* @class         SettingsModule
* @description   Global NestJS module that provides runtime configuration resolution to the entire
*                application. SettingsService merges database-stored settings with environment variables
*                to produce the effective FTP, SMTP, SMS and environment configuration at any given time.
*
* @responsibilities
*                 - Instantiate and export SettingsService as a singleton
*                 - Make SettingsService available application-wide without explicit module imports
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - @Global() ensures every module can inject SettingsService without importing SettingsModule.
*                 - Environment variables take precedence over database values; database values are the fallback.
*
*               Notes for future enhancements:
*                 - Cache the merged config for a configurable TTL to reduce database reads on hot paths.
***********************************************************************************************************************/
@Global()
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
