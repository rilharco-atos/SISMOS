import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/*********************************************************************************************************************
* @method       urlComPooler
* @description  Appends pgbouncer=true to a DATABASE_URL when it targets a connection pooler
*               (Neon "-pooler" hostnames or URLs already containing "pgbouncer"). Pooler connections
*               in transaction mode do not support prepared statements, and the Prisma pgbouncer
*               flag disables them. When the flag is already present the URL is returned unchanged.
* @param        url — raw DATABASE_URL string, or undefined
* @return       Modified URL with pgbouncer=true appended when needed, or the original value
*********************************************************************************************************************/
export function urlComPooler(url: string | undefined): string | undefined {
  if (!url || !/-pooler\.|pgbouncer/i.test(url) || /[?&]pgbouncer=/i.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}pgbouncer=true`;
}

/***********************************************************************************************************************
* @class         PrismaService
* @description   Injectable NestJS service that extends PrismaClient and manages the database
*                connection lifecycle as a NestJS module. Opens the connection on module init
*                and closes it on module destroy.
*
* @responsibilities
*                 - Extend PrismaClient with NestJS dependency injection support
*                 - Apply the pgbouncer=true flag to DATABASE_URL when connecting through a pooler
*                 - Connect to the database when the NestJS module initialises
*                 - Disconnect from the database when the NestJS module is destroyed
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - urlComPooler() is called in the constructor so that the datasource URL is
*                   correct before Prisma opens any connection.
*                 - This service is provided at the global scope via PrismaModule so that all
*                   feature modules can inject it without importing PrismaModule individually.
***********************************************************************************************************************/
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = urlComPooler(process.env.DATABASE_URL);
    super(url ? { datasources: { db: { url } } } : undefined);
  }

  /*********************************************************************************************************************
  * @method       onModuleInit
  * @description  Opens the Prisma database connection when the NestJS module initialises.
  * @return       Promise resolving when the connection is established
  * @uses         PrismaClient.$connect
  *********************************************************************************************************************/
  async onModuleInit() {
    await this.$connect();
  }

  /*********************************************************************************************************************
  * @method       onModuleDestroy
  * @description  Closes the Prisma database connection when the NestJS module is torn down.
  * @return       Promise resolving when the connection is closed
  * @uses         PrismaClient.$disconnect
  *********************************************************************************************************************/
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
