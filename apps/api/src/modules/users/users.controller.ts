import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  findAll(@Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Acesso restrito a administradores');
    return this.users.findAll();
  }

  @Post()
  create(@Request() req: any, @Body() dto: CreateUserDto) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Acesso restrito a administradores');
    return this.users.create(dto);
  }

  @Put(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Acesso restrito a administradores');
    return this.users.update(id, dto);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Acesso restrito a administradores');
    return this.users.remove(id, req.user.id);
  }
}
