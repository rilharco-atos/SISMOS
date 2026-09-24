import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ListaKey } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CreateDestinatarioDto, UpdateDestinatarioDto } from './dto/destinatario.dto';

function mascarar(valor: string | null | undefined, tipo: 'email' | 'telefone'): string {
  if (!valor) return '';
  if (tipo === 'email') {
    const [local, dominio] = valor.split('@');
    return `${local.substring(0, 2)}***@${dominio}`;
  }
  return valor.substring(0, 3) + '*'.repeat(Math.max(0, valor.length - 5)) + valor.slice(-2);
}

@Injectable()
export class ListasService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

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

  // Internal — returns raw (unmasked) for delivery use
  async findRawByLista(lista: ListaKey) {
    return this.prisma.destinatarioLista.findMany({
      where: { lista, ativo: true },
      include: { destinatario: true },
    });
  }

  /** Cria o destinatário e as associações às listas numa só transação. */
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

  /** Atualiza o destinatário. Email/telefone só são alterados quando enviados (a listagem devolve-os mascarados). */
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
