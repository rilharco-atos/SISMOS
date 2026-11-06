import { Controller, Post, UseGuards, Request, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';

/***********************************************************************************************************************
* @class         AuthController
* @description   NestJS REST controller that exposes the authentication endpoint for the IPMA Seismic
*                Bulletins platform. Handles user login via the Passport local strategy.
*
* @responsibilities
*                 - Accept POST /auth/login with email and password credentials
*                 - Delegate credential validation to LocalStrategy and token signing to AuthService
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - AuthGuard('local') runs LocalStrategy before the handler, injecting req.user on success.
*                 - @HttpCode(200) overrides NestJS's default 201 for POST endpoints.
***********************************************************************************************************************/
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /*********************************************************************************************************************
  * @method       login
  * @description  Handles POST /auth/login. Passport's LocalStrategy validates credentials before this
  *               handler runs; on success, AuthService signs and returns the JWT.
  * @param        req — Express request with the authenticated user injected by LocalStrategy
  * @return       Object with access_token and user profile
  * @uses         AuthService.login
  *********************************************************************************************************************/
  @Post('login')
  @HttpCode(200)
  @UseGuards(AuthGuard('local'))
  @ApiOperation({ summary: 'Login de utilizador' })
  login(@Request() req: any) {
    return this.auth.login(req.user);
  }
}
