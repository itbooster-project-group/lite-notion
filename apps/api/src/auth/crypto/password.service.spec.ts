import { InternalServerErrorException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { applicationConfig } from '../../config/application-config';
import { PasswordService } from '../crypto/password.service';
import { exceedsPasswordByteLimit, passwordByteLength } from '../helpers';

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

describe('PasswordService: граница bcrypt в 72 байта', () => {
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

  it.each([
    ['72 ASCII-символа', 'a'.repeat(72), 72],
    ['36 символов кириллицы', 'п'.repeat(36), 72],
    ['18 emoji', '😀'.repeat(18), 72],
  ])('принимает %s (ровно на границе)', async (_case, password, expectedBytes) => {
    expect(passwordByteLength(password)).toBe(expectedBytes);
    await expect(service.hash(password)).resolves.toMatch(/^\$2[aby]\$/);
  });

  it.each([
    ['73 ASCII-символа', 'a'.repeat(73), 73],
    ['37 символов кириллицы', 'п'.repeat(37), 74],
    ['40 символов кириллицы, проходящих @Length(72)', 'п'.repeat(40), 80],
    ['19 emoji', '😀'.repeat(19), 76],
    ['36 emoji, проходящих @Length(72)', '😀'.repeat(36), 144],
  ])('отклоняет %s', async (_case, password, expectedBytes) => {
    expect(passwordByteLength(password)).toBe(expectedBytes);
    expect(exceedsPasswordByteLimit(password)).toBe(true);
    await expect(service.hash(password)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('не даёт паролю длиннее лимита совпасть с хешем его усечённой части', async () => {
    const withinLimit = 'п'.repeat(36);
    const passwordHash = await service.hash(withinLimit);

    // bcrypt сам обрезал бы вход на 72 байтах и вернул true — защитная проверка
    // возвращает false, поэтому длинный пароль не открывает чужую учётную запись.
    await expect(service.compare(`${withinLimit}хвост`, passwordHash)).resolves.toBe(false);
    await expect(service.compare(withinLimit, passwordHash)).resolves.toBe(true);
  });

  it('возвращает false, а не бросает, чтобы вход отвечал 401, а не 500', async () => {
    const passwordHash = await service.hash('correct horse battery');

    await expect(service.compare('a'.repeat(200), passwordHash)).resolves.toBe(false);
  });

  it('не бросает при сравнении с dummy-хешем на слишком длинном пароле', async () => {
    await expect(service.compareWithDummy('п'.repeat(100))).resolves.toBeUndefined();
  });
});
