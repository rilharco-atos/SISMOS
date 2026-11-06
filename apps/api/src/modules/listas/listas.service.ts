import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ListaKey } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CreateDestinatarioDto, UpdateDestinatarioDto } from './dto/destinatario.dto';

/*********************************************************************************************************************
* @method       mascarar
* @description  Masks a contact value for display: shows the first 2 characters of the email local
*               part before the domain, or the first 3 and last 2 digits of a phone number.
* @param        valor — raw email or phone string, or null/undefined for an absent contact
* @param        tipo — 'email' or 'telefone' to select the masking strategy
* @return       Masked string, or empty string when valor is absent
*********************************************************************************************************************/
function mascarar(valor: string | null | undefined, tipo: 'email' | 'telefone'): string {
  if (!valor) return '';
  if (tipo === 'email') {
    const [local, dominio] = valor.split('@');
    return `${local.substring(0, 2)}***@${dominio}`;
  }
  return valor.substring(0, 3) + '*'.repeat(Math.max(0, valor.length - 5)) + valor.slice(-2);
}

/***********************************************************************************************************************
* @class         ListasService
* @description   Injectable NestJS service for managing dissemination list membership. Stores recipients
*                and their list associations. Returns masked contact data to the API layer; exposes
*                raw data only to internal delivery consumers.
*
* @responsibilities
*                 - CRUD operations for Destinatario records and their DestinatarioLista associations
*                 - Return masked email and phone values in all API-facing responses
*                 - Provide an unmasked findRawByLista method for use by DeliveryService
*                 - Log all create, update and delete actions to the audit trail
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Masking is applied in-memory on the result of Prisma queries, not in the DB.
*                 - Email and phone updates are ignored when the incoming field is empty (callers
*                   receive masked values and cannot unintentionally wipe the real data with blanks).
*                 - List replacement in update() deletes all existing DestinatarioLista rows
*                   and recreates them; ativo defaults to true for new rows.
***********************************************************************************************************************/
@Injectable()
export class ListasService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /*********************************************************************************************************************
  * @method       findAll
  * @description  Returns all recipients with masked contact data, optionally filtered by lista key
  *               and optionally including inactive memberships.
  * @param        lista — optional ListaKey to filter to a single list
  * @param        incluirInativos — when false (default) only active DestinatarioLista rows are returned
  * @return       Array of DestinatarioLista records with masked Destinatario contact fields
  * @uses         mascarar, PrismaService.destinatarioLista.findMany
  *********************************************************************************************************************/
  async findAll(lista?: ListaKey, incluirInativos = false) {
    const where: any = {};
    if (!incluirInativos) where.ativo = true;
    if (lista) where.lista = lista;

    const registos = await this.prisma.destinatarioLista.findMany({
      where,
      include: { destinatario: true },
    });

    return registos.map(r => ({
      ...r,
      destinatario: {
        ...r.destinatario,
        email: mascarar(r.destinatario.email, 'email'),
        telefone: mascarar(r.destinatario.telefone ?? '', 'telefone'),
      },
    }));
  }

  /*********************************************************************************************************************
  * @method       findDestinatario
  * @description  Returns a single recipient by UUID with masked contact data and all list memberships.
  * @param        id — recipient UUID
  * @return       Destinatario record with listas included and contact data masked
  * @uses         mascarar, PrismaService.destinatario.findUnique
  *********************************************************************************************************************/
  async findDestinatario(id: string) {
    const d = await this.prisma.destinatario.findUnique({
      where: { id },
      include: { listas: true },
    });
    if (!d) throw new NotFoundException('Destinatário não encontrado');
    return {
      ...d,
      email: mascarar(d.email, 'email'),
      telefone: mascarar(d.telefone ?? '', 'telefone'),
    };
  }

  /*********************************************************************************************************************
  * @method       findRawByLista
  * @description  Returns all active recipients for the given lista key with unmasked contact data.
  *               Internal method — do not expose through the REST controller.
  * @param        lista — ListaKey to query
  * @return       Array of DestinatarioLista records with unmasked Destinatario data
  * @uses         PrismaService.destinatarioLista.findMany
  *********************************************************************************************************************/
  async findRawByLista(lista: ListaKey) {
    return this.prisma.destinatarioLista.findMany({
      where: { lista, ativo: true },
      include: { destinatario: true },
    });
  }

  /*********************************************************************************************************************
  * @method       create
  * @description  Creates a new recipient and their list associations atomically in a single transaction.
  * @param        dto — CreateDestinatarioDto with name, contact data and target lists
  * @param        userId — authenticated user id for audit logging
  * @return       Created recipient with masked contact data
  * @uses         PrismaService.$transaction, AuditService.log, ListasService.findDestinatario
  *********************************************************************************************************************/
  async create(dto: CreateDestinatarioDto, userId: string) {
    const destinatario = await this.prisma.$transaction(async tx => {
      const d = await tx.destinatario.create({
        data: { nome: dto.nome, organizacao: dto.organizacao, email: dto.email, telefone: dto.telefone, interno: dto.interno ?? false },
      });
      if (dto.listas.length) await tx.destinatarioLista.createMany({ data: dto.listas.map(lista => ({ destinatarioId: d.id, lista })) });
      return d;
    });
    await this.audit.log({ userId, acao: 'CRIAR_DESTINATARIO', entidade: 'Destinatario', entidadeId: destinatario.id, detalhes: { listas: dto.listas } });
    return this.findDestinatario(destinatario.id);
  }

  /*********************************************************************************************************************
  * @method       update
  * @description  Updates recipient fields and optionally replaces all list memberships. When dto.listas
  *               is provided, deletes existing DestinatarioLista rows and recreates them. When only
  *               dto.ativo is provided, updates the ativo flag on all existing rows without touching lists.
  * @param        id — recipient UUID
  * @param        dto — UpdateDestinatarioDto with the fields to update
  * @param        userId — authenticated user id for audit logging
  * @return       Updated recipient with masked contact data
  * @uses         PrismaService.$transaction, AuditService.log
  *********************************************************************************************************************/
  async update(id: string, dto: UpdateDestinatarioDto, userId: string) {
    const atual = await this.prisma.destinatario.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Destinatário não encontrado');
    await this.prisma.$transaction(async tx => {
      await tx.destinatario.update({ where: { id }, data: { nome: dto.nome, organizacao: dto.organizacao, email: dto.email, telefone: dto.telefone, interno: dto.interno } });
      if (dto.listas !== undefined) {
        await tx.destinatarioLista.deleteMany({ where: { destinatarioId: id } });
        if (dto.listas.length) await tx.destinatarioLista.createMany({ data: dto.listas.map(lista => ({ destinatarioId: id, lista, ativo: dto.ativo ?? true })) });
      } else if (dto.ativo !== undefined) {
        await tx.destinatarioLista.updateMany({ where: { destinatarioId: id }, data: { ativo: dto.ativo } });
      }
    });
    await this.audit.log({
      userId, acao: 'EDITAR_DESTINATARIO', entidade: 'Destinatario', entidadeId: id,
      detalhes: { campos: Object.keys(dto).filter(k => (dto as any)[k] !== undefined), listas: dto.listas, ativo: dto.ativo },
    });
    return this.findDestinatario(id);
  }

  /*********************************************************************************************************************
  * @method       remove
  * @description  Permanently deletes a recipient and all their list memberships in a single transaction.
  * @param        id — recipient UUID
  * @param        userId — authenticated user id for audit logging
  * @return       Object with deleted: true
  * @uses         PrismaService.$transaction, AuditService.log
  *********************************************************************************************************************/
  async remove(id: string, userId: string) {
    const atual = await this.prisma.destinatario.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Destinatário não encontrado');
    await this.prisma.$transaction([
      this.prisma.destinatarioLista.deleteMany({ where: { destinatarioId: id } }),
      this.prisma.destinatario.delete({ where: { id } }),
    ]);
    await this.audit.log({ userId, acao: 'ELIMINAR_DESTINATARIO', entidade: 'Destinatario', entidadeId: id, detalhes: { nome: atual.nome } });
    return { deleted: true };
  }
}
