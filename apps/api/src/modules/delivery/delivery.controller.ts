import { Controller, Post, Get, Param, Body, UseGuards, Request, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEnum, IsOptional } from 'class-validator';
import { ListaKey } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeliveryService } from './delivery.service';

/** Listas de destino do envio. "listas" (legado) aplica-se a email e SMS quando as outras não vêm. */
export class EnviarDto {
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) emailListas?: ListaKey[];
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) smsListas?: ListaKey[];
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) listas?: ListaKey[];
}

@ApiTags('delivery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('delivery')
export class DeliveryController {
  constructor(private svc: DeliveryService) {}

  @Post(':comunicadoId/versoes/:versaoId/enviar')
  enviar(
    @Param('comunicadoId', ParseUUIDPipe) comunicadoId: string,
    @Param('versaoId', ParseUUIDPipe) versaoId: string,
    @Body() dto: EnviarDto,
    @Request() req: any,
  ) {
    return this.svc.enviarComunicado(comunicadoId, versaoId, dto.emailListas ?? dto.listas ?? [], dto.smsListas ?? dto.listas ?? [], req.user.id);
  }

  @Get(':comunicadoId/versoes/:versaoId/email-preview')
  async preview(@Param('comunicadoId', ParseUUIDPipe) comunicadoId: string, @Param('versaoId', ParseUUIDPipe) versaoId: string) {
    return { html: await this.svc.preVisualizarEmail(comunicadoId, versaoId) };
  }
}
