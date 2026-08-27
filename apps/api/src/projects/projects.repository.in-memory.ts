import { randomUUID } from 'node:crypto';

import {
  type CreateProjectInput,
  type ProjectRecord,
  ProjectsRepository,
} from './projects.repository';

/**
 * Тестовая реализация. Воспроизводит наблюдаемый контракт Prisma-версии, включая
 * порядок выдачи (имя, затем id) и фильтрацию по владельцу.
 */
export class InMemoryProjectsRepository extends ProjectsRepository {
  readonly records = new Map<string, ProjectRecord>();

  async create(input: CreateProjectInput): Promise<ProjectRecord> {
    const project: ProjectRecord = { id: randomUUID(), name: input.name, ownerId: input.ownerId };

    this.records.set(project.id, project);

    return project;
  }

  async findAllByOwner(ownerId: string): Promise<ProjectRecord[]> {
    return [...this.records.values()]
      .filter((project) => project.ownerId === ownerId)
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
      .map((project) => ({ ...project }));
  }

  async findByIdForOwner(id: string, ownerId: string): Promise<ProjectRecord | null> {
    const project = this.records.get(id);

    return project === undefined || project.ownerId !== ownerId ? null : { ...project };
  }
}
