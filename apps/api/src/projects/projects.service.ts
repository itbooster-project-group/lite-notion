import { Inject, Injectable } from '@nestjs/common';

import { ProjectNotFoundError } from './errors';
import {
  type DeletedProjectRecord,
  type ProjectRecord,
  ProjectsRepository,
} from './projects.repository';

@Injectable()
export class ProjectsService {
  constructor(@Inject(ProjectsRepository) private readonly projects: ProjectsRepository) {}

  create(ownerId: string, name: string): Promise<ProjectRecord> {
    return this.projects.create({ name, ownerId });
  }

  listForOwner(ownerId: string): Promise<ProjectRecord[]> {
    return this.projects.findAllByOwner(ownerId);
  }

  /**
   * Единственная точка, через которую другие модули узнают, что проект существует
   * и доступен вызывающему. Возвращает запись, а не булево: `PagesService` нужен
   * подтверждённый `projectId`, и промежуточная проверка «а теперь прочитаем ещё
   * раз» только открывала бы окно между проверкой и использованием.
   */
  async requireOwned(id: string, ownerId: string): Promise<ProjectRecord> {
    const project = await this.projects.findByIdForOwner(id, ownerId);

    if (project === null) {
      throw new ProjectNotFoundError();
    }

    return project;
  }

  listDeletedForOwner(ownerId: string): Promise<DeletedProjectRecord[]> {
    return this.projects.findDeletedByOwner(ownerId);
  }

  /**
   * Каскад на страницы идёт в той же транзакции, что и пометка проекта, поэтому
   * живёт в репозитории: разнести их значило бы допустить состояние «проект
   * удалён, страницы ещё живы», которого спека не допускает.
   */
  async softDelete(id: string, ownerId: string): Promise<void> {
    if (!(await this.projects.softDelete(id, ownerId))) {
      throw new ProjectNotFoundError();
    }
  }

  purge(id: string, ownerId: string, cascade: boolean): Promise<void> {
    return this.projects.purge(id, ownerId, cascade);
  }

  purgeTrash(ownerId: string, cascade: boolean): Promise<void> {
    return this.projects.purgeTrash(ownerId, cascade);
  }

  async restore(id: string, ownerId: string): Promise<ProjectRecord> {
    const project = await this.projects.restore(id, ownerId);

    if (project === null) {
      throw new ProjectNotFoundError();
    }

    return project;
  }
}
