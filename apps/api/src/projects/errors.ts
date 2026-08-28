/**
 * Проект не найден либо принадлежит другому пользователю. Эти два случая
 * намеренно неразличимы: отдельная ошибка «чужой проект» была бы оракулом
 * существования чужих проектов. Перевод в `NotFoundException` делает контроллер.
 */
export class ProjectNotFoundError extends Error {
  constructor() {
    super('Project not found');
    this.name = 'ProjectNotFoundError';
  }
}
