import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Ligações via pooler (Neon "-pooler", PgBouncer) em modo transação exigem pgbouncer=true no Prisma
 * (sem prepared statements partilhados). Sem pooler o URL é usado tal como está.
 */
export function urlComPooler(url: string | undefined): string | undefined {
  if (!url || !/-pooler\.|pgbouncer/i.test(url) || /[?&]pgbouncer=/i.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}pgbouncer=true`;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = urlComPooler(process.env.DATABASE_URL);
    super(url ? { datasources: { db: { url } } } : undefined);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
