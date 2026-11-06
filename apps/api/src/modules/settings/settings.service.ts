import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Ambiente, FtpSettings, SmsSettings, SmtpSettings, resolverAmbiente, resolverFtp, resolverSms, resolverSmtp } from './settings.resolver';

/***********************************************************************************************************************
* @class         SettingsService
* @description   Injectable NestJS service that provides the effective runtime configuration for all
*                subsystems. Reads from the singleton SystemConfig database row, falling back to
*                environment variables for values not overridden in the backoffice.
*
* @responsibilities
*                 - Provide FTP polling settings (host, port, credentials, path, interval)
*                 - Provide SMTP/email transport settings (host, port, credentials, provider)
*                 - Provide SMS transport settings (provider, credentials, sender)
*                 - Provide the current runtime environment (dev/staging/production)
*                 - Report whether the automatic dispatch flag is enabled
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - The DB row is read fresh on every call so that backoffice changes take effect
*                   immediately without requiring a server restart.
*                 - Resolution logic is in settings.resolver.ts to keep this service thin and testable.
*                 - The singleton SystemConfig row has id = 'singleton'.
***********************************************************************************************************************/
@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService, private env: ConfigService) {}

  private async cfg() {
    return this.prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
  }

  private get ler() {
    return (k: string) => this.env.get<string>(k);
  }

  /*********************************************************************************************************************
  * @method       ftp
  * @description  Returns the effective FTP polling settings, merging the DB override with env vars.
  * @return       Promise resolving to FtpSettings value object
  * @uses         resolverFtp, SettingsService.cfg
  *********************************************************************************************************************/
  async ftp(): Promise<FtpSettings> { return resolverFtp(await this.cfg(), this.ler); }

  /*********************************************************************************************************************
  * @method       smtp
  * @description  Returns the effective SMTP/email transport settings.
  * @return       Promise resolving to SmtpSettings value object
  * @uses         resolverSmtp, SettingsService.cfg
  *********************************************************************************************************************/
  async smtp(): Promise<SmtpSettings> { return resolverSmtp(await this.cfg(), this.ler); }

  /*********************************************************************************************************************
  * @method       sms
  * @description  Returns the effective SMS transport settings.
  * @return       Promise resolving to SmsSettings value object
  * @uses         resolverSms, SettingsService.cfg
  *********************************************************************************************************************/
  async sms(): Promise<SmsSettings> { return resolverSms(await this.cfg(), this.ler); }

  /*********************************************************************************************************************
  * @method       ambiente
  * @description  Returns the current runtime environment from environment variables (dev/staging/production).
  * @return       Ambiente enum value
  * @uses         resolverAmbiente
  *********************************************************************************************************************/
  ambiente(): Ambiente { return resolverAmbiente(this.ler); }

  /*********************************************************************************************************************
  * @method       envioAutomatico
  * @description  Returns true when the automatic dispatch flag is enabled in the SystemConfig row.
  * @return       Promise resolving to boolean
  * @uses         SettingsService.cfg
  *********************************************************************************************************************/
  async envioAutomatico(): Promise<boolean> {
    return !!(await this.cfg())?.envioAutomatico;
  }
}
