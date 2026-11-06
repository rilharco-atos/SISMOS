import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ForbiddenException, Request, ParseUUIDPipe } from '@nestjs/common';
import { CreateDestinatarioDto, UpdateDestinatarioDto } from './dto/destinatario.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ListasService } from './listas.service';
import { ListaKey } from '@prisma/client';

/***********************************************************************************************************************
* @class         ListasController
* @description   NestJS REST controller for managing dissemination list recipients. Exposes CRUD
*                operations for Destinatario records. All write operations are restricted to ADMIN role.
*
* @responsibilities
*                 - List recipients with optional list and inactive filters (all authenticated users)
*                 - Get a single recipient by UUID (all authenticated users)
*                 - Create, update and delete recipients (ADMIN only)
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Contact data (email, phone) is returned masked from ListasService for all responses.
*                 - Role check is manual (not a guard) to reuse the already-resolved req.user object.
***********************************************************************************************************************/
@ApiTags('listas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('listas')
export class ListasController {
  constructor(private svc: ListasService) {}

  /*********************************************************************************************************************
  * @method       findAll
  * @description  Returns all recipients, optionally filtered by lista key and including inactive rows.
  * @param        lista — optional ListaKey query parameter
  * @param        inativos — when "true", includes inactive DestinatarioLista rows
  * @return       Array of DestinatarioLista records with masked contact data
  * @uses         ListasService.findAll
  *********************************************************************************************************************/
  @Get()
  findAll(@Query('lista') lista?: ListaKey, @Query('inativos') inativos?: string) {
    return this.svc.findAll(lista, inativos === 'true');
  }

  /*********************************************************************************************************************
  * @method       findOne
  * @description  Returns a single recipient by UUID with all list memberships and masked contact data.
  * @param        id — recipient UUID from the URL path
  * @return       Destinatario record with masked email and telefone
  * @uses         ListasService.findDestinatario
  *********************************************************************************************************************/
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.svc.findDestinatario(id); }

  /*********************************************************************************************************************
  * @method       create
  * @description  Creates a new recipient and their list associations. Restricted to ADMIN role.
  * @param        req — Express request with the authenticated user
  * @param        dto — CreateDestinatarioDto with name, contact data and target lists
  * @return       Created recipient with masked contact data
  * @uses         ListasService.create
  *********************************************************************************************************************/
  @Post()
  create(@Request() req: any, @Body() dto: CreateDestinatarioDto) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.create(dto, req.user.id);
  }

  /*********************************************************************************************************************
  * @method       update
  * @description  Updates a recipient's data and optionally replaces their list memberships.
  *               Restricted to ADMIN role.
  * @param        id — recipient UUID from the URL path
  * @param        req — Express request with the authenticated user
  * @param        dto — UpdateDestinatarioDto with the fields to update
  * @return       Updated recipient with masked contact data
  * @uses         ListasService.update
  *********************************************************************************************************************/
  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Request() req: any, @Body() dto: UpdateDestinatarioDto) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.update(id, dto, req.user.id);
  }

  /*********************************************************************************************************************
  * @method       remove
  * @description  Permanently deletes a recipient and all their list memberships. Restricted to ADMIN role.
  * @param        id — recipient UUID from the URL path
  * @param        req — Express request with the authenticated user
  * @return       Object with deleted: true
  * @uses         ListasService.remove
  *********************************************************************************************************************/
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.svc.remove(id, req.user.id);
  }
}
