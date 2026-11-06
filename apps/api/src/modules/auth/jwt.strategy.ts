import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

/***********************************************************************************************************************
* @class         JwtStrategy
* @description   Passport strategy that validates JWT Bearer tokens on protected routes. Extends the
*                passport-jwt Strategy configured to read tokens from the Authorization header.
*
* @responsibilities
*                 - Extract and verify JWT tokens from the Authorization Bearer header
*                 - Transform the validated JWT payload into the request user object
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - JWT_SECRET must be set in the environment; matched against the secret used when signing.
*                 - The validated payload becomes req.user, available in all JwtAuthGuard-protected handlers.
***********************************************************************************************************************/
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  /*********************************************************************************************************************
  * @method       constructor
  * @description  Configures the JWT strategy with Bearer token extraction, expiry validation and the
  *               secret key read from ConfigService.
  * @param        cfg — ConfigService used to read the JWT_SECRET environment variable
  *********************************************************************************************************************/
  constructor(cfg: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: cfg.get('JWT_SECRET'),
    });
  }

  /*********************************************************************************************************************
  * @method       validate
  * @description  Called by Passport after token signature and expiry are verified. Transforms the raw
  *               JWT payload into the user object that populates req.user on protected routes.
  * @param        payload — decoded JWT payload with sub, email, name and role fields
  * @return       Object with id, email, name and role extracted from the payload
  *********************************************************************************************************************/
  validate(payload: any) {
    return { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
  }
}
