import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

export interface ProjectRecord {
  id: string;
  ownerId: string;
  name: string;
}

export interface CreateProjectInput {
  ownerId: string;
  name: string;
}

/**
 * Узкий доступ к таблице проектов. Абстрактный класс, а не интерфейс: он же
 * служит DI-токеном, и тесты подставляют вместо него in-memory реализацию.
 *
 * Каждый метод принимает `ownerId` и фильтрует по нему. Метода «найти проект по
 * id без владельца» здесь нет намеренно — он позволил бы вызывающему коду
 * случайно прочитать чужой проект.
 */
@Injectable()
export abstract class ProjectsRepository {
  abstract create(input: CreateProjectInput): Promise<ProjectRecord>;

  abstract findAllByOwner(ownerId: string): Promise<ProjectRecord[]>;

  abstract findByIdForOwner(id: string, ownerId: string): Promise<ProjectRecord | null>;
}

@Injectable()
export class PrismaProjectsRepository extends ProjectsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  create(input: CreateProjectInput): Promise<ProjectRecord> {
    return this.prisma.project.create({
      data: { name: input.name, ownerId: input.ownerId },
      select: { id: true, name: true, ownerId: true },
    });
  }

  findAllByOwner(ownerId: string): Promise<ProjectRecord[]> {
    return this.prisma.project.findMany({
      // Имя не уникально, поэтому одного порядка по нему мало: id добавлен
      // тай-брейком, иначе выдача двух одноимённых проектов могла бы меняться
      // между запросами.
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, ownerId: true },
      where: { ownerId },
    });
  }

  findByIdForOwner(id: string, ownerId: string): Promise<ProjectRecord | null> {
    return this.prisma.project.findFirst({
      select: { id: true, name: true, ownerId: true },
      where: { id, ownerId },
    });
  }
}
