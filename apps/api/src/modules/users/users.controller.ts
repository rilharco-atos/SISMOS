import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Request, ForbiddenException, BadRequestException, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/***********************************************************************************************************************
* @class         UsersController
* @description   NestJS REST controller that exposes user-management endpoints. All routes require
*                authentication and ADMIN role — regular users cannot access any of these endpoints.
*
* @responsibilities
*                 - List all non-system users (ADMIN only)
*                 - Create, update and delete user accounts (ADMIN only)
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Role check is performed in each handler rather than a dedicated guard for clarity.
*                 - @UseGuards(JwtAuthGuard) ensures the token is valid before role checks run.
***********************************************************************************************************************/
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  /*********************************************************************************************************************
  * @method       findAll
  * @description  Returns all non-system user accounts. Restricted to ADMIN role.
  * @param        req — Express request with the authenticated user injected by JwtAuthGuard
  * @return       Array of user objects without passwordHash
  * @uses         UsersService.findAll
  *********************************************************************************************************************/
  @Get('me')
  getMe(@Request() req: any) {
    return this.users.findOne(req.user.id);
  }

  @Post('me/avatar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('avatar', {
    storage: memoryStorage(),
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) return cb(new BadRequestException('Apenas imagens são aceites'), false);
      cb(null, true);
    },
    limits: { fileSize: 512 * 1024 },
  }))
  async uploadAvatar(@Request() req: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Ficheiro em falta');
    const avatarUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    await this.users.updateAvatar(req.user.id, avatarUrl);
    return { avatarUrl };
  }

  @Get()
  findAll(@Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Acesso restrito a administradores');
    return this.users.findAll();
  }

  /*********************************************************************************************************************
  * @method       create
  * @description  Creates a new user account. Restricted to ADMIN role.
  * @param        req — Express request with the authenticated user
  * @param        dto — CreateUserDto with name, email, password and role
  * @return       Created user object without passwordHash
  * @uses         UsersService.create
  *********************************************************************************************************************/
  @Post()
  create(@Request() req: any, @Body() dto: CreateUserDto) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Acesso restrito a administradores');
    return this.users.create(dto);
  }

  /*********************************************************************************************************************
  * @method       update
  * @description  Updates an existing user account. Restricted to ADMIN role.
  * @param        req — Express request with the authenticated user
  * @param        id — user identifier from the URL path
  * @param        dto — UpdateUserDto with the fields to update
  * @return       Updated user object without passwordHash
  * @uses         UsersService.update
  *********************************************************************************************************************/
  @Put(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Acesso restrito a administradores');
    return this.users.update(id, dto);
  }

  /*********************************************************************************************************************
  * @method       remove
  * @description  Deletes a user account. Restricted to ADMIN role. Admins cannot delete their own account.
  * @param        req — Express request with the authenticated user (for self-deletion guard)
  * @param        id — user identifier from the URL path
  * @uses         UsersService.remove
  *********************************************************************************************************************/
  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Acesso restrito a administradores');
    return this.users.remove(id, req.user.id);
  }
}
