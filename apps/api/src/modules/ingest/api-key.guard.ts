import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

/*********************************************************************************************************************
* @method       safeEqual
* @description  Performs a constant-time comparison of two strings to prevent timing attacks.
*               Returns false immediately (without further comparison) when the lengths differ,
*               which leaks the length but not the content — acceptable for API key comparison.
* @param        a — first string to compare
* @param        b — second string to compare
* @return       true when the strings are equal, false otherwise
*********************************************************************************************************************/
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/***********************************************************************************************************************
* @class         IngestApiKeyGuard
* @description   NestJS CanActivate guard that protects the ingest endpoints with API key
*                authentication. The caller must supply the key in the X-Api-Key request header.
*
* @responsibilities
*                 - Reject requests missing the X-Api-Key header
*                 - Validate the provided key against INGEST_API_KEY env var (highest priority)
*                 - Fall back to the ingestApiKey value stored in the singleton SystemConfig DB row
*                 - Reject requests when neither source provides a configured key
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - INGEST_API_KEY env var takes precedence over the DB key to support external
*                   secret management (Vault, Kubernetes secrets) without backoffice dependency.
*                 - safeEqual() uses timingSafeEqual to prevent timing attacks on key comparison.
*                 - The guard rejects requests with a descriptive message when no key is configured
*                   so operators are alerted to the missing setup step.
***********************************************************************************************************************/
@Injectable()
export class IngestApiKeyGuard implements CanActivate {
  constructor(private config: ConfigService, private prisma: PrismaService) {}

  /*********************************************************************************************************************
  * @method       canActivate
  * @description  Validates the X-Api-Key header against the configured ingest API key. Checks the
  *               INGEST_API_KEY env var first; falls back to the DB SystemConfig row when absent.
  * @param        ctx — NestJS execution context providing access to the HTTP request
  * @return       Promise resolving to true when the key is valid
  * @uses         safeEqual, ConfigService.get, PrismaService.systemConfig.findUnique
  *********************************************************************************************************************/
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const provided = (req.headers['x-api-key'] ?? '') as string;
    if (!provided) throw new UnauthorizedException('Header X-Api-Key em falta');

    const envKey = this.config.get<string>('INGEST_API_KEY') ?? '';
    if (envKey) {
      if (!safeEqual(provided, envKey)) throw new UnauthorizedException('Chave de API inválida');
      return true;
    }

    const cfg = await this.prisma.systemConfig.findUnique({ where: { id: 'singleton' }, select: { ingestApiKey: true } });
    const dbKey = cfg?.ingestApiKey ?? '';
    if (!dbKey) throw new UnauthorizedException('API de ingestão não configurada — gere uma chave no backoffice');
    if (!safeEqual(provided, dbKey)) throw new UnauthorizedException('Chave de API inválida');
    return true;
  }
}
