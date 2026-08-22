import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

export interface UserRecord {
  id: string;
  email: string;
  nickname: string;
  passwordHash: string;
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  nickname: string;
  passwordHash: string;
}

/**
 * Email хранится уже нормализованным, поэтому уникальность обеспечивает обычный
 * `@unique`, а не функциональный индекс. Нормализация продублирована здесь, чтобы
 * сервис оставался корректным независимо от того, прошёл ли вызов через DTO.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
        nickname: input.nickname,
        passwordHash: input.passwordHash,
      },
    });
  }
}
