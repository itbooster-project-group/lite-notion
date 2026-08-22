import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { applicationConfig } from '../config/application-config';
import { PasswordService } from './password.service';

const bcryptHashPattern = /^\$2[aby]\$\d{2}\$/;

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PasswordService,
        { provide: applicationConfig.KEY, useValue: { bcryptRounds: 4 } },
      ],
    }).compile();

    service = moduleRef.get(PasswordService);
    await service.onModuleInit();
  });

  it('возвращает bcrypt-хеш, не совпадающий с паролем', async () => {
    const passwordHash = await service.hash('correct horse battery');

    expect(passwordHash).toMatch(bcryptHashPattern);
    expect(passwordHash).not.toBe('correct horse battery');
    expect(passwordHash).not.toContain('correct horse battery');
  });

  it('использует соль: два хеша одного пароля различаются', async () => {
    const [first, second] = await Promise.all([
      service.hash('correct horse battery'),
      service.hash('correct horse battery'),
    ]);

    expect(first).not.toBe(second);
  });

  it('подтверждает верный пароль', async () => {
    const passwordHash = await service.hash('correct horse battery');

    await expect(service.compare('correct horse battery', passwordHash)).resolves.toBe(true);
  });

  it('отклоняет неверный пароль', async () => {
    const passwordHash = await service.hash('correct horse battery');

    await expect(service.compare('wrong horse battery', passwordHash)).resolves.toBe(false);
  });

  it('выполняет сравнение с dummy-хешем без ошибки', async () => {
    await expect(service.compareWithDummy('any password')).resolves.toBeUndefined();
  });

  it('считает dummy-хеш до первого использования', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PasswordService,
        { provide: applicationConfig.KEY, useValue: { bcryptRounds: 4 } },
      ],
    }).compile();
    const uninitialized = moduleRef.get(PasswordService);

    await expect(uninitialized.compareWithDummy('any password')).resolves.toBeUndefined();
  });
});
