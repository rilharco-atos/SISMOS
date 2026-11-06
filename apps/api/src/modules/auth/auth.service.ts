import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

/***********************************************************************************************************************
* @class         AuthService
* @description   Injectable NestJS service that handles user authentication. Validates credentials
*                against the database and issues JWT access tokens on successful login.
*
* @responsibilities
*                 - Validate email and password credentials using bcrypt comparison
*                 - Generate signed JWT access tokens for authenticated users
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Inactive users (active=false) are rejected even with correct credentials.
*                 - JWT payload includes sub (id), email, name and role fields.
***********************************************************************************************************************/
@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
  ) {}

  /*********************************************************************************************************************
  * @method       validateUser
  * @description  Validates the provided email and password against the database. Throws
  *               UnauthorizedException for unknown users, inactive accounts or wrong passwords.
  * @param        email — user email address
  * @param        password — plain-text password to compare against the stored bcrypt hash
  * @return       Full user record from the database on success
  * @uses         UsersService.findByEmail, bcrypt.compare
  *********************************************************************************************************************/
  async validateUser(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user || !user.active) throw new UnauthorizedException('Credenciais inválidas');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas');
    return user;
  }

  /*********************************************************************************************************************
  * @method       login
  * @description  Signs a JWT access token for the authenticated user and returns it alongside the
  *               user profile fields needed by the frontend.
  * @param        user — authenticated user object with id, email, name and role
  * @return       Object with access_token string and user profile object
  * @uses         JwtService.sign
  *********************************************************************************************************************/
  login(user: { id: string; email: string; name: string; role: string; avatarUrl?: string | null }) {
    const payload = { sub: user.id, email: user.email, name: user.name, role: user.role };
    return {
      access_token: this.jwt.sign(payload),
      user: { id: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: user.avatarUrl ?? null },
    };
  }
}
