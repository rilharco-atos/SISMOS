import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from './auth.service';

/***********************************************************************************************************************
* @class         LocalStrategy
* @description   Passport local strategy that authenticates users with email and password credentials.
*                Used exclusively by the POST /auth/login endpoint via AuthGuard('local').
*
* @responsibilities
*                 - Read email and password from the login request body
*                 - Delegate credential validation to AuthService.validateUser
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - usernameField is overridden to 'email' to match the platform's login DTO field name.
*                 - A successful validation populates req.user which AuthController.login then processes.
***********************************************************************************************************************/
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  /*********************************************************************************************************************
  * @method       constructor
  * @description  Configures the local strategy to read credentials from the 'email' field instead of
  *               the Passport default 'username' field.
  * @param        auth — AuthService used to validate credentials in the validate() callback
  *********************************************************************************************************************/
  constructor(private auth: AuthService) {
    super({ usernameField: 'email' });
  }

  /*********************************************************************************************************************
  * @method       validate
  * @description  Called by Passport with the email and password from the request body. Delegates to
  *               AuthService.validateUser and returns the user record on success.
  * @param        email — user email address from the login request body
  * @param        password — plain-text password from the login request body
  * @return       Authenticated user record
  * @uses         AuthService.validateUser
  *********************************************************************************************************************/
  validate(email: string, password: string) {
    return this.auth.validateUser(email, password);
  }
}
