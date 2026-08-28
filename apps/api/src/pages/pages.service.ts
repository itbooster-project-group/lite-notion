import { Inject, Injectable } from '@nestjs/common';

import { ProjectsService } from '../projects/projects.service';
import { TIPTAP_SCHEMA_VERSION } from './constants';
import { PageNotFoundError, PageProjectMismatchError } from './errors';
import { compareSiblings } from './helpers';
import { type PageRecord, PagesRepository } from './pages.repository';

export interface CreatePageCommand {
  ownerId: string;
  projectId: string;
  parentPageId: string | null;
  title: string;
}

export interface MovePageCommand {
  ownerId: string;
  pageId: string;
  parentPageId: string | null;
  previousSiblingId: string | null;
  nextSiblingId: string | null;
}

export interface PageTreeNode extends PageRecord {
  children: PageTreeNode[];
}

@Injectable()
export class PagesService {
  constructor(
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(ProjectsService) private readonly projects: ProjectsService,
  ) {}

  async create(command: CreatePageCommand): Promise<PageRecord> {
    // Проект проверяется всегда, даже когда есть родитель: иначе клиент мог бы
    // подставить чужой projectId и узнать по коду ответа, существует ли он.
    await this.projects.requireOwned(command.projectId, command.ownerId);

    if (command.parentPageId !== null) {
      const parent = await this.requireOwnedPage(command.parentPageId, command.ownerId);

      if (parent.projectId !== command.projectId) {
        throw new PageProjectMismatchError();
      }
    }

    return this.pages.create({
      createdById: command.ownerId,
      ownerId: command.ownerId,
      parentPageId: command.parentPageId,
      projectId: command.projectId,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      title: command.title,
    });
  }

  /**
   * Собирает вложенность из плоского списка за один проход. Страница, чей
   * родитель отфильтрован как удалённый, становится корнем выдачи, а не
   * исчезает: потерять поддерево молча хуже, чем показать его выше по уровню.
   */
  async findTree(ownerId: string): Promise<PageTreeNode[]> {
    const pages = await this.pages.findAllByOwner(ownerId);
    const nodes = new Map<string, PageTreeNode>(
      pages.map((page) => [page.id, { ...page, children: [] }]),
    );
    const roots: PageTreeNode[] = [];

    for (const node of nodes.values()) {
      const parent = node.parentPageId === null ? undefined : nodes.get(node.parentPageId);

      if (parent === undefined) {
        roots.push(node);
      } else {
        parent.children.push(node);
      }
    }

    for (const node of nodes.values()) {
      node.children.sort(compareSiblings);
    }

    return roots.sort(compareSiblings);
  }

  findById(pageId: string, ownerId: string): Promise<PageRecord> {
    return this.requireOwnedPage(pageId, ownerId);
  }

  async rename(pageId: string, ownerId: string, title: string): Promise<PageRecord> {
    const page = await this.pages.rename(pageId, ownerId, title);

    if (page === null) {
      throw new PageNotFoundError();
    }

    return page;
  }

  /**
   * Проверка владельца, проверка цикла и запись живут в репозитории: они обязаны
   * идти в одной транзакции под advisory lock, а разнести их по слоям значило бы
   * проверить дерево до блокировки.
   */
  move(command: MovePageCommand): Promise<PageRecord> {
    return this.pages.move({
      nextSiblingId: command.nextSiblingId,
      ownerId: command.ownerId,
      pageId: command.pageId,
      parentPageId: command.parentPageId,
      previousSiblingId: command.previousSiblingId,
    });
  }

  private async requireOwnedPage(pageId: string, ownerId: string): Promise<PageRecord> {
    const page = await this.pages.findByIdForOwner(pageId, ownerId);

    if (page === null) {
      throw new PageNotFoundError();
    }

    return page;
  }
}
