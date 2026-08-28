import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { InMemoryProjectsRepository } from './projects.repository.in-memory';
import { ProjectsService } from './projects.service';

const user: AuthenticatedUser = {
  id: '11111111-1111-1111-1111-111111111111',
  sessionId: '99999999-9999-9999-9999-999999999999',
};

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let repository: InMemoryProjectsRepository;

  beforeEach(async () => {
    repository = new InMemoryProjectsRepository();

    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [ProjectsService, { provide: ProjectsRepository, useValue: repository }],
    }).compile();

    controller = moduleRef.get(ProjectsController);
  });

  it('создаёт проект от имени текущего пользователя', async () => {
    const project = await controller.create(user, { name: 'Workspace' });

    expect(project).toMatchObject({ name: 'Workspace', ownerId: user.id });
  });

  it('возвращает только проекты текущего пользователя', async () => {
    await repository.create({ name: 'Not yours', ownerId: 'other' });
    await controller.create(user, { name: 'Mine' });

    const projects = await controller.list(user);

    expect(projects.map((project) => project.name)).toEqual(['Mine']);
  });

  it('не публикует полей сверх контракта DTO', async () => {
    const project = await controller.create(user, { name: 'Workspace' });

    expect(Object.keys(project).sort()).toEqual(['id', 'name', 'ownerId']);
  });
});
