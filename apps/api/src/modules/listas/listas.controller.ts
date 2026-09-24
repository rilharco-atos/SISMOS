import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ForbiddenException, Request, ParseUUIDPipe } from '@nestjs/common';
import { CreateDestinatarioDto, UpdateDestinatarioDto } from './dto/destinatario.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ListasService } from './listas.service';
import { ListaKey } from '@prisma/client';

@ApiTags('listas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('listas')
export class ListasController {
  constructor(private svc: ListasService) {}

  @Get()
  findAll(@Query('lista') lista?: ListaKey, @Query('inativos') inativos?: string) {
    return this.svc.findAll(lista, inativos === 'true');
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.svc.findDestinatario(id); }

  @Post()
  create(@Request() req: any, @Body() dto: CreateDestinatarioDto) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.create(dto, req.user.id);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Request() req: any, @Body() dto: UpdateDestinatarioDto) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.update(id, dto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.remove(id, req.user.id);
  }
}
