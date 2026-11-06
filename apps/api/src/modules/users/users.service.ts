import { Injectable, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/***********************************************************************************************************************
* @class         UsersService
* @description   Injectable NestJS service that manages user accounts for the IPMA Seismic Bulletins
*                platform. Handles creation, retrieval, update and deletion of user records.
*
* @responsibilities
*                 - List all non-system users for the admin interface
*                 - Look up users by email for authentication
*                 - Create new accounts with bcrypt-hashed passwords
*                 - Update user profile fields, optionally re-hashing a new password
*                 - Delete user accounts while preventing self-deletion
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - The 'system' user (SYSTEM_USER_ID) is excluded from all list results.
*                 - passwordHash is never returned except in findByEmail which is used only for auth.
*
*               Notes for future enhancements:
*                 - Add pagination to findAll for large user bases.
***********************************************************************************************************************/
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /*********************************************************************************************************************
  * @method       findAll
  * @description  Returns all user accounts except the internal system user, ordered by name.
  *               Includes a count of bulletins created by each user.
  * @return       Array of user objects with id, name, email, role, active, timestamps and _count
  *********************************************************************************************************************/
  async findAll() {
    return this.prisma.user.findMany({
      where: { id: { not: 'system' } },
      select: {
        id: true, name: true, email: true, role: true,
        active: true, criadoEm: true, atualizadoEm: true,
        _count: { select: { comunicados: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /*********************************************************************************************************************
  * @method       findByEmail
  * @description  Looks up a user by email address including the passwordHash field. Used exclusively
  *               by AuthService for credential validation.
  * @param        email — email address to search for
  * @return       Full user record including passwordHash, or null if not found
  *********************************************************************************************************************/
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /*********************************************************************************************************************
  * @method       findOne
  * @description  Returns a single user by id with selected safe fields. Throws NotFoundException when
  *               the user does not exist.
  * @param        id — user identifier
  * @return       User object with id, name, email, role, active and criadoEm
  *********************************************************************************************************************/
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, active: true, avatarUrl: true, criadoEm: true },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');
    return user;
  }

  async updateAvatar(id: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id },
      data: { avatarUrl },
      select: { id: true, avatarUrl: true },
    });
  }

  /*********************************************************************************************************************
  * @method       create
  * @description  Creates a new user account after verifying the email is not already registered.
  *               Hashes the password with bcrypt before persisting.
  * @param        dto — CreateUserDto with name, email, password and role
  * @return       Created user object with id, name, email, role, active and criadoEm
  *********************************************************************************************************************/
  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email já registado');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: { name: dto.name, email: dto.email, passwordHash, role: dto.role },
      select: { id: true, name: true, email: true, role: true, active: true, criadoEm: true },
    });
  }

  /*********************************************************************************************************************
  * @method       update
  * @description  Updates the specified user account fields. When a new password is provided it is
  *               bcrypt-hashed before storing; the plain-text password field is removed from the data object.
  * @param        id — user identifier
  * @param        dto — UpdateUserDto with the fields to update
  * @return       Updated user object with id, name, email, role and active
  *********************************************************************************************************************/
  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
      delete data.password;
    }
    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, active: true },
    });
  }

  /*********************************************************************************************************************
  * @method       remove
  * @description  Deletes the specified user account. Throws ForbiddenException when the requester
  *               tries to delete their own account, and NotFoundException when the user does not exist.
  * @param        id — user identifier to delete
  * @param        requesterId — id of the user making the request
  *********************************************************************************************************************/
  async remove(id: string, requesterId: string) {
    if (id === requesterId) throw new ForbiddenException('Não pode eliminar a sua própria conta');
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
  }
}
