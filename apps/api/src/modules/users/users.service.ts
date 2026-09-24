import { Injectable, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, active: true, criadoEm: true },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');
    return user;
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email já registado');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: { name: dto.name, email: dto.email, passwordHash, role: dto.role },
      select: { id: true, name: true, email: true, role: true, active: true, criadoEm: true },
    });
  }

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

  async remove(id: string, requesterId: string) {
    if (id === requesterId) throw new ForbiddenException('Não pode eliminar a sua própria conta');
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
  }
}
