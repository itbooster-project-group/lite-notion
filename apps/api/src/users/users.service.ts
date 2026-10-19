import { Inject, Injectable } from '@nestjs/common';

import { normalizeEmail } from '../common/helpers';
import { PrismaService } from '../database/prisma.service';

export interface UserRecord {
  avatarAssetId: string | null;
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

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({
      include: { profile: { select: { avatarAssetId: true } } },
      where: { email: normalizeEmail(email) },
    });
    return user ? { ...user, avatarAssetId: user.profile?.avatarAssetId ?? null } : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({
      include: { profile: { select: { avatarAssetId: true } } },
      where: { id },
    });
    return user ? { ...user, avatarAssetId: user.profile?.avatarAssetId ?? null } : null;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const user = await this.prisma.user.create({
      data: {
        email: normalizeEmail(input.email),
        name: input.name,
        passwordHash: input.passwordHash,
      },
    });
    return { ...user, avatarAssetId: null };
  }
}
