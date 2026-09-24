import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface AuditEntry {
  userId: string;
  acao: string;
  entidade: string;
  entidadeId?: string;
  comunicadoId?: string;
  detalhes?: Record<string, any>;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: entry.userId,
        acao: entry.acao,
        entidade: entry.entidade,
        entidadeId: entry.entidadeId,
        comunicadoId: entry.comunicadoId,
        detalhes: entry.detalhes as any,
        ipAddress: entry.ipAddress,
      },
    });
  }

  async findAll(limit = 100) {
    return this.prisma.auditLog.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { criadoEm: 'desc' },
      take: limit,
    });
  }
}
