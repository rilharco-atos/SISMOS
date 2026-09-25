import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [{ provide: StorageService, useFactory: (prisma: PrismaService) => new StorageService(prisma), inject: [PrismaService] }],
  exports: [StorageService],
})
export class StorageModule {}
