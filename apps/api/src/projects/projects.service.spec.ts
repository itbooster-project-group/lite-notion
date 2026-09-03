import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ProjectNotFoundError } from './errors';
import { ProjectsRepository } from './projects.repository';
import { InMemoryProjectsRepository } from './projects.repository.in-memory';
import { ProjectsService } from './projects.service';

const owner = '11111111-1111-1111-1111-111111111111';
const stranger = '22222222-2222-2222-2222-222222222222';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let repository: InMemoryProjectsRepository;

  beforeEach(async () => {
    repository = new InMemoryProjectsRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [ProjectsService, { provide: ProjectsRepository, useValue: repository }],
    }).compile();

    service = moduleRef.get(ProjectsService);
  });

  it('создаёт проект с владельцем из текущего пользователя', async () => {
    const project = await service.create(owner, 'Workspace');

    expect(project).toMatchObject({ name: 'Workspace', ownerId: owner });
  });

  it('допускает два проекта с одинаковым именем', async () => {
    const first = await service.create(owner, 'Workspace');
    const second = await service.create(owner, 'Workspace');

    expect(second.id).not.toBe(first.id);
    await expect(service.listForOwner(owner)).resolves.toHaveLength(2);
  });

  it('возвращает пустой список, а не ошибку', async () => {
    await expect(service.listForOwner(owner)).resolves.toEqual([]);
  });

  it('не показывает чужие проекты', async () => {
    await service.create(stranger, 'Not yours');
    const mine = await service.create(owner, 'Mine');

    await expect(service.listForOwner(owner)).resolves.toEqual([mine]);
  });

  it('возвращает проекты в детерминированном порядке', async () => {
    await service.create(owner, 'b');
    await service.create(owner, 'a');

    const first = await service.listForOwner(owner);
    const second = await service.listForOwner(owner);

    expect(first.map((project) => project.name)).toEqual(['a', 'b']);
    expect(second).toEqual(first);
  });

  it('отвечает одинаковой ошибкой на чужой и на несуществующий проект', async () => {
    const foreign = await service.create(stranger, 'Not yours');

    const foreignError = await service.requireOwned(foreign.id, owner).catch((error) => error);
    const missingError = await service
      .requireOwned('33333333-3333-4333-8333-333333333333', owner)
      .catch((error) => error);

    expect(foreignError).toBeInstanceOf(ProjectNotFoundError);
    expect(missingError).toBeInstanceOf(ProjectNotFoundError);
    expect(foreignError.message).toBe(missingError.message);
  });

  it('возвращает свой проект из requireOwned', async () => {
    const project = await service.create(owner, 'Workspace');

    await expect(service.requireOwned(project.id, owner)).resolves.toEqual(project);
  });
});
