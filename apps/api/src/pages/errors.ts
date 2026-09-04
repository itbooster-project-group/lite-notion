/**
 * Страница не найдена, удалена либо чужая. Три случая намеренно неразличимы: иначе
 * ошибка стала бы оракулом существования чужих страниц.
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
 * Родитель, указанный при создании или перемещении, не найден, удалён либо чужой.
 * Отдельно от `PageNotFoundError`: в теле запроса несколько идентификаторов страниц,
 * и вызывающий должен понять, какой из них не подошёл.
 */
export class PageParentNotFoundError extends Error {
  constructor() {
    super('Parent page not found');
    this.name = 'PageParentNotFoundError';
  }
}

/** Предыдущий сосед не найден, удалён либо чужой. */
export class PreviousSiblingNotFoundError extends Error {
  constructor() {
    super('previousSiblingId not found');
    this.name = 'PreviousSiblingNotFoundError';
  }
}

/** Следующий сосед не найден, удалён либо чужой. */
export class NextSiblingNotFoundError extends Error {
  constructor() {
    super('nextSiblingId not found');
    this.name = 'NextSiblingNotFoundError';
  }
}

/**
 * Сосед существует и доступен вызывающему, но лежит не под целевым родителем.
 * Запрос внутренне противоречив — контроллер переводит это в `400`.
 *
 * Слот приходит параметром, а не отдельным классом на каждого соседа: причина у
 * обоих одна, различается только идентификатор из тела запроса.
 */
export class SiblingParentMismatchError extends Error {
  constructor(readonly slot: 'previousSiblingId' | 'nextSiblingId') {
    super(`${slot} belongs to a different parent`);
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
 * Между указанными соседями стоит ещё один брат, то есть щели, в которую просят
 * вставить страницу, не существует. Поставить её «ровно между» невозможно, а
 * молча положить рядом значило бы выполнить не тот запрос.
 */
export class SiblingsNotAdjacentError extends Error {
  constructor() {
    super('previousSiblingId and nextSiblingId must be adjacent among the target siblings');
    this.name = 'SiblingsNotAdjacentError';
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
 * Проект страницы сам в корзине: живой страницы в удалённом проекте не бывает, а
 * подъём в корень не помогает — корень в том же проекте.
 *
 * `409`, а не `404`: корзина страницу показывает, скрывать нечего.
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
 * Проект назначения указан при живом собственном проекте. Принять его значило бы
 * завести перенос между проектами в обход `specs/page-tree`. `400`, а не `409`:
 * запрос внутренне противоречив.
 */
export class PageRestoreTargetProjectRejectedError extends Error {
  constructor() {
    super('projectId is accepted only when the page own project is in the trash');
    this.name = 'PageRestoreTargetProjectRejectedError';
  }
}
