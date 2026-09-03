/**
 * Страница не найдена, удалена либо принадлежит другому пользователю. Все три
 * случая намеренно неразличимы: отдельная ошибка «чужая страница» была бы
 * оракулом существования чужих страниц. Перевод в `NotFoundException` делает
 * контроллер — репозиторий и сервис про HTTP не знают.
 */
export class PageNotFoundError extends Error {
  constructor() {
    super('Page not found');
    this.name = 'PageNotFoundError';
  }
}

/**
 * Перенос страницы в саму себя или в собственного потомка. Конфликт с текущим
 * состоянием дерева, а не с правами: контроллер переводит его в `409`.
 */
export class PageCycleError extends Error {
  constructor() {
    super('A page cannot be moved into itself or its own descendant');
    this.name = 'PageCycleError';
  }
}

/**
 * Сосед существует и доступен вызывающему, но лежит не под целевым родителем.
 * Запрос внутренне противоречив — контроллер переводит это в `400`.
 */
export class SiblingParentMismatchError extends Error {
  constructor() {
    super('Sibling belongs to a different parent');
    this.name = 'SiblingParentMismatchError';
  }
}

/**
 * Страница и указанный проект или родитель лежат в разных проектах. Обе записи
 * вызывающему видны, поэтому раскрытия чужих данных нет и ответ — `400`.
 */
export class PageProjectMismatchError extends Error {
  constructor() {
    super('Page and parent must belong to the same project');
    this.name = 'PageProjectMismatchError';
  }
}

/**
 * Соседи заданы противоречиво: один и тот же идентификатор с обеих сторон либо
 * «предыдущий» лежит не раньше «следующего». Обе страницы вызывающему видны,
 * поэтому это `400`, а не раскрытие чужих данных.
 */
export class SiblingOrderError extends Error {
  constructor() {
    super('previousSiblingId must precede nextSiblingId among the target siblings');
    this.name = 'SiblingOrderError';
  }
}

/**
 * Проект восстанавливаемой страницы сам лежит в корзине. Живая страница в
 * удалённом проекте невозможна, а подъём в корень не помогает: корень принадлежит
 * тому же удалённому проекту.
 *
 * `409`, а не `404`: страница вызывающему видна — корзина её показывает, — поэтому
 * скрывать нечего, и запрос противоречит состоянию, а не правам.
 *
 * Единственный отказ восстановления по состоянию. Источник удаления восстановление
 * не гоняет: вложенная страница не отклоняется, а поднимается в корень своего
 * проекта.
 */
export class PageRestoreProjectDeletedError extends Error {
  constructor() {
    super(
      'The project of this page is in the trash: restore it, or pass projectId of a live project',
    );
    this.name = 'PageRestoreProjectDeletedError';
  }
}

/**
 * Проект назначения указан, а собственный проект страницы жив — переносить её
 * незачем и некуда. Принять параметр здесь значило бы завести перенос между
 * проектами чёрным ходом, минуя требование `specs/page-tree`.
 *
 * `400`, а не `409`: запрос внутренне противоречив, и обе записи вызывающему
 * видны, поэтому раскрытия чужих данных нет.
 */
export class PageRestoreTargetProjectRejectedError extends Error {
  constructor() {
    super('projectId is accepted only when the page own project is in the trash');
    this.name = 'PageRestoreTargetProjectRejectedError';
  }
}
