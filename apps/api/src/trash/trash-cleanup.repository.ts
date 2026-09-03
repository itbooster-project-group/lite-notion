import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

export interface PurgedCounts {
  projects: number;
  pages: number;
}

/**
 * Физическая очистка корзины по сроку хранения. Владельца не знает намеренно:
 * задача идёт по всей базе и фильтрует по одной отметке времени, тогда как
 * ручное удаление работает доменными правилами и живёт в репозиториях модулей.
 */
@Injectable()
export abstract class TrashCleanupRepository {
  abstract purgeExpired(cutoff: Date): Promise<PurgedCounts>;
}

@Injectable()
export class PrismaTrashCleanupRepository extends TrashCleanupRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Сначала проекты, затем страницы: так второй запрос обрабатывает меньше строк.
   * Каскад не унесёт запись, которой ещё рано: отметка потомка не позже отметки
   * предка — инвариант закреплён интеграционным тестом.
   */
  async purgeExpired(cutoff: Date): Promise<PurgedCounts> {
    const projects = await this.prisma.project.deleteMany({ where: { deletedAt: { lt: cutoff } } });
    const pages = await this.prisma.page.deleteMany({ where: { deletedAt: { lt: cutoff } } });

    return { pages: pages.count, projects: projects.count };
  }
}
