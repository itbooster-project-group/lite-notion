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
