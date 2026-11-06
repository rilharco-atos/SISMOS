import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { AvatarsController } from './avatars.controller';
import { UsersService } from './users.service';

/***********************************************************************************************************************
* @class         UsersModule
* @description   NestJS module that manages user accounts for the IPMA Seismic Bulletins platform. Provides
*                CRUD endpoints for back-office user management and exports UsersService so AuthModule can
*                look up users by e-mail during authentication.
*
* @responsibilities
*                 - Register UsersController to expose user-management REST endpoints
*                 - Provide and export UsersService for authentication and user lookups
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - PrismaService is injected from the global PrismaModule — no explicit import needed here.
*                 - Password hashing is performed in UsersService using bcrypt.
*
*               Notes for future enhancements:
*                 - Add role-based access control to restrict user creation to super-admins only.
***********************************************************************************************************************/
@Module({
  controllers: [UsersController, AvatarsController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
