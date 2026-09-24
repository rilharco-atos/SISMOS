import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Ambiente, FtpSettings, SmsSettings, SmtpSettings, resolverAmbiente, resolverFtp, resolverSms, resolverSmtp } from './settings.resolver';

/**
 * Configuração efetiva em tempo de execução (backoffice com recurso ao .env).
 * Lida da base de dados em cada utilização, para que alterações no backoffice tenham efeito imediato.
 */
@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService, private env: ConfigService) {}

  private async cfg() {
    return this.prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
  }

  private get ler() {
    return (k: string) => this.env.get<string>(k);
  }

  async ftp(): Promise<FtpSettings> { return resolverFtp(await this.cfg(), this.ler); }
  async smtp(): Promise<SmtpSettings> { return resolverSmtp(await this.cfg(), this.ler); }
  async sms(): Promise<SmsSettings> { return resolverSms(await this.cfg(), this.ler); }

  ambiente(): Ambiente { return resolverAmbiente(this.ler); }

  async envioAutomatico(): Promise<boolean> {
    return !!(await this.cfg())?.envioAutomatico;
  }
}
