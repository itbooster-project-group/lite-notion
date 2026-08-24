import { Inject, Injectable } from '@nestjs/common';

import { normalizeEmail } from '../common/helpers';
import { PrismaService } from '../database/prisma.service';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash: string;
}

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  }

  findById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(input: CreateUserInput): Promise<UserRecord> {
    return this.prisma.user.create({
      data: {
        email: normalizeEmail(input.email),
        name: input.name,
        passwordHash: input.passwordHash,
      },
    });
  }
}
