import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { LocalStrategy } from './local.strategy';
import { UsersModule } from '../users/users.module';

/***********************************************************************************************************************
* @class         AuthModule
* @description   NestJS module that assembles the authentication layer for the IPMA platform. Registers
*                Passport strategies (Local for login, JWT for session), configures the JWT signing
*                secret and expiry from environment variables, and exposes AuthService to the container.
*
* @responsibilities
*                 - Configure PassportModule as the Passport.js integration point
*                 - Configure JwtModule with the application secret and token expiry
*                 - Register LocalStrategy and JwtStrategy Passport strategies
*                 - Import UsersModule to allow AuthService to look up users by e-mail
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - JwtModule uses registerAsync so the secret is resolved from ConfigService at runtime.
*                 - JWT_EXPIRY defaults to '8h' if the environment variable is not set.
*
*               Notes for future enhancements:
*                 - Add refresh-token support with a separate signing secret and rotation endpoint.
***********************************************************************************************************************/
@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET') ?? 'changeme',
        signOptions: { expiresIn: cfg.get<string>('JWT_EXPIRY') ?? '8h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
