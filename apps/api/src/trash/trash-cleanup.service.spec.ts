import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TRASH_RETENTION_MS } from '../common/constants';
import { type PurgedCounts, TrashCleanupRepository } from './trash-cleanup.repository';
import { TrashCleanupService } from './trash-cleanup.service';

const now = new Date('2026-08-31T12:00:00.000Z');

/**
 * Двойник, запоминающий отсечку: она и есть весь контракт задачи — какие записи
 * попадут под удаление, решает срок хранения, а не сама задача.
 */
class RecordingTrashCleanupRepository extends TrashCleanupRepository {
  cutoffs: Date[] = [];
  counts: PurgedCounts = { pages: 0, projects: 0 };
  failure: Error | null = null;

  async purgeExpired(cutoff: Date): Promise<PurgedCounts> {
    this.cutoffs.push(cutoff);

    if (this.failure !== null) {
      throw this.failure;
    }

    return this.counts;
  }
}

describe('TrashCleanupService', () => {
  let service: TrashCleanupService;
  let repository: RecordingTrashCleanupRepository;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    repository = new RecordingTrashCleanupRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [TrashCleanupService, { provide: TrashCleanupRepository, useValue: repository }],
    }).compile();

    service = moduleRef.get(TrashCleanupService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('отсекает по сроку хранения от текущего момента', async () => {
    await service.removeExpiredTrash();

    expect(repository.cutoffs).toEqual([new Date(now.getTime() - TRASH_RETENTION_MS)]);
  });

  it('не трогает записи в пределах срока хранения', async () => {
    await service.removeExpiredTrash();

    const [cutoff] = repository.cutoffs;
    const deletedYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Запись, удалённая вчера, новее отсечки, поэтому под условие не попадает.
    expect(cutoff).toBeDefined();
    expect(deletedYesterday.getTime()).toBeGreaterThan((cutoff as Date).getTime());
  });

  it('не пишет в журнал, когда удалять нечего', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await service.removeExpiredTrash();

    expect(log).not.toHaveBeenCalled();
  });

  it('пишет в журнал, когда что-то удалено', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    repository.counts = { pages: 3, projects: 1 };

    await service.removeExpiredTrash();

    expect(log).toHaveBeenCalledOnce();
  });

  it('переживает отказ базы, не роняя процесс и не раскрывая подключение', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    repository.failure = new Error('connect ECONNREFUSED postgresql://user:secret@localhost:5432');

    await expect(service.removeExpiredTrash()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('secret');
  });

  it('называет отказ, чтобы постоянный отличался от временного', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const broken = Object.assign(new Error('column "deletedAt" does not exist'), {
      code: 'P2022',
      name: 'PrismaClientKnownRequestError',
    });
    repository.failure = broken;

    await service.removeExpiredTrash();

    const logged = String(warn.mock.calls[0]?.[0]);

    expect(logged).toContain('PrismaClientKnownRequestError');
    expect(logged).toContain('P2022');
    // Сообщение ошибки не идёт в журнал: оно может нести строку подключения.
    expect(logged).not.toContain('does not exist');
  });

  it('идемпотентна: повторный запуск считает ту же отсечку и не падает', async () => {
    await service.removeExpiredTrash();
    await service.removeExpiredTrash();

    expect(repository.cutoffs).toHaveLength(2);
    expect(repository.cutoffs[0]).toEqual(repository.cutoffs[1]);
  });
});
