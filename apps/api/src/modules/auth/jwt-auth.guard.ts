import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/***********************************************************************************************************************
* @class         JwtAuthGuard
* @description   NestJS guard that protects routes by requiring a valid JWT Bearer token in the
*                Authorization header. Apply with @UseGuards(JwtAuthGuard) on controllers or handlers.
*
* @responsibilities
*                 - Reject unauthenticated requests with 401 Unauthorized
*                 - Delegate token validation to JwtStrategy via Passport
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Extends AuthGuard('jwt') which invokes JwtStrategy automatically.
*                 - Used as the standard authentication guard on all protected REST endpoints.
***********************************************************************************************************************/
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
