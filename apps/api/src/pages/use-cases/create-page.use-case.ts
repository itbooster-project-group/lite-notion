import { PageRole } from '@lite-notion/page-permissions';
import { Inject, Injectable } from '@nestjs/common';

import { ownerLock } from '../../common/helpers';
import { TransactionRunner, type TransactionScope } from '../../database/transaction';
import { assertRole } from '../../page-permissions/helpers';
import { PagePermissionsRepository } from '../../page-permissions/page-permissions.repository';
import { ProjectNotFoundError } from '../../projects/errors';
import { ProjectsRepository } from '../../projects/projects.repository';
import { TIPTAP_SCHEMA_VERSION } from '../constants';
import { PageParentNotFoundError, PageProjectMismatchError } from '../errors';
import { positionBetween } from '../helpers';
import { PageDocumentRepository } from '../page-document/page-document.repository';
import { type PageRecord, PagesRepository } from '../pages.repository';
import type { PageWithRole } from '../pages.service';

export interface CreatePageCommand {
  actorId: string;
  projectId: string;
  parentPageId: string | null;
  title: string;
}

/** Репозитории, привязанные к транзакции. Привязываются разом, а не по месту. */
interface BoundRepositories {
  pages: PagesRepository;
  projects: ProjectsRepository;
  documents: PageDocumentRepository;
  permissions: PagePermissionsRepository;
}

/** Владелец создаваемой страницы и роль актора на ней. */
interface Placement {
  ownerId: string;
  role: PageRole;
}

/**
 * Страница встаёт в конец уровня. Проверки идут под той же блокировкой, что и
 * вставка: снаружи они устареют, а тройной FK про `deletedAt` не знает.
 *
 * Блокировка берётся по владельцу дерева, а не по актору: дочернюю страницу может
 * создавать редактор из чужого дерева, и ключ по нему сериализовал бы вставку не с
 * теми, с кем нужно, — два редактора одного родителя разошлись бы по разным ключам
 * и получили одинаковый ранг.
 */
@Injectable()
export class CreatePageUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(ProjectsRepository) private readonly projects: ProjectsRepository,
    @Inject(PageDocumentRepository) private readonly documents: PageDocumentRepository,
    @Inject(PagePermissionsRepository)
    private readonly permissions: PagePermissionsRepository,
  ) {}

  execute(command: CreatePageCommand): Promise<PageWithRole> {
    return this.transactions.run(async (scope) => {
      const bound = this.bind(scope);

      // Сначала блокировка, потом проверки: если проверить проект или родителя до
      // лока, параллельное удаление проскочит между проверкой и вставкой, и живая
      // страница окажется в удалённом проекте. Ключ для root-страницы — сам актор,
      // для дочерней — владелец родителя, поэтому его приходится узнать заранее.
      const lockOwnerId =
        command.parentPageId === null
          ? command.actorId
          : ((await bound.permissions.findPageOwner(command.parentPageId)) ?? command.actorId);

      await scope.lock(ownerLock(lockOwnerId));

      const placement = await this.resolvePlacement(bound, command);

      if (placement.ownerId !== lockOwnerId) {
        // Владелец родителя сменился между чтением ключа и блокировкой — значит,
        // заблокировано не то дерево. Отказ честнее вставки под неверным ключом.
        throw new PageParentNotFoundError();
      }

      const last = await bound.pages.findLastPositionAtLevel({
        ownerId: placement.ownerId,
        parentPageId: command.parentPageId,
        projectId: command.projectId,
      });

      const page = await bound.pages.insert({
        // Создатель — актор, владелец — хозяин дерева: страницу в чужом дереве
        // заводит тот, кому выдано право его изменять.
        createdById: command.actorId,
        ownerId: placement.ownerId,
        parentPageId: command.parentPageId,
        position: positionBetween(last, null),
        projectId: command.projectId,
        title: command.title,
      });

      // Той же транзакцией: связь 1..1 обязана выполняться с первой строки.
      await bound.documents.insertEmpty(page.id, TIPTAP_SCHEMA_VERSION);

      return { ...page, role: placement.role };
    });
  }

  private bind(scope: TransactionScope): BoundRepositories {
    return {
      documents: this.documents.bind(scope),
      pages: this.pages.bind(scope),
      permissions: this.permissions.bind(scope),
      projects: this.projects.bind(scope),
    };
  }

  /**
   * Root-страницу заводит только владелец проекта; дочернюю — всякий, у кого на
   * родителе есть `editor`. Владелец и проект дочерней наследуются от родителя:
   * иначе тройной FK всё равно отверг бы запись.
   */
  private async resolvePlacement(
    bound: BoundRepositories,
    command: CreatePageCommand,
  ): Promise<Placement> {
    if (command.parentPageId === null) {
      const project = await bound.projects.findByIdForOwner(command.projectId, command.actorId);

      if (project === null) {
        throw new ProjectNotFoundError();
      }

      return { ownerId: command.actorId, role: PageRole.OWNER };
    }

    const parent = await this.requireEditableParent(bound, command);

    return { ownerId: parent.page.ownerId, role: parent.role };
  }

  private async requireEditableParent(
    bound: BoundRepositories,
    command: CreatePageCommand,
  ): Promise<{ page: PageRecord; role: PageRole }> {
    const parentPageId = command.parentPageId;

    if (parentPageId === null) {
      throw new PageParentNotFoundError();
    }

    const role = await bound.permissions.resolveRole(command.actorId, parentPageId);

    if (role === null) {
      // Недоступный родитель неотличим от несуществующего — иначе отказ стал бы
      // оракулом существования чужих страниц.
      throw new PageParentNotFoundError();
    }

    assertRole(role, PageRole.EDITOR);

    const page = await bound.pages.findLiveById(parentPageId);

    if (page === null) {
      throw new PageParentNotFoundError();
    }

    if (page.projectId !== command.projectId) {
      throw new PageProjectMismatchError();
    }

    return { page, role };
  }
}
