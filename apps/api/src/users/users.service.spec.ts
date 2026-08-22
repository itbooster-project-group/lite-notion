import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../database/prisma.service';
import { normalizeEmail, UsersService } from './users.service';

describe('normalizeEmail', () => {
  it.each([
    ['User@Example.COM', 'user@example.com'],
    ['  user@example.com  ', 'user@example.com'],
    ['USER@EXAMPLE.COM', 'user@example.com'],
  ])('приводит %s к %s', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });
});

describe('UsersService', () => {
  let service: UsersService;
  let user: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    user = { create: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue(null) };

    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: { user } }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('нормализует email при поиске', async () => {
    await service.findByEmail('  User@Example.COM ');

    expect(user.findUnique).toHaveBeenCalledWith({ where: { email: 'user@example.com' } });
  });

  it('нормализует email при создании', async () => {
    await service.create({
      email: 'User@Example.COM',
      nickname: 'user',
      passwordHash: 'hash',
    });

    expect(user.create).toHaveBeenCalledWith({
      data: { email: 'user@example.com', nickname: 'user', passwordHash: 'hash' },
    });
  });

  it('не нормализует nickname', async () => {
    await service.create({
      email: 'user@example.com',
      nickname: '  Ada Lovelace ',
      passwordHash: 'hash',
    });

    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nickname: '  Ada Lovelace ' }) }),
    );
  });

  it('ищет по идентификатору без преобразований', async () => {
    await service.findById('user-id');

    expect(user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-id' } });
  });
});
