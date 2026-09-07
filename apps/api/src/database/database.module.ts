import { Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';
import { PrismaTransactionRunner, TransactionRunner } from './transaction';

@Module({
  exports: [PrismaService, TransactionRunner],
  providers: [PrismaService, { provide: TransactionRunner, useClass: PrismaTransactionRunner }],
})
export class DatabaseModule {}
