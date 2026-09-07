/**
 * Удаление уничтожит записи, которые корзина показывала снаружи удаляемого:
 * страницу, удалённую раньше самостоятельно, но физически лежащую внутри. Сохранить
 * её нельзя — остаётся предупредить. `409`, а не `400`: запрос корректен и
 * противоречит состоянию; повтор с подтверждением выполняет удаление целиком.
 *
 * В общих ошибках, а не в модуле: механика одна у страниц и у проектов.
 */
export class PurgeConfirmationRequiredError extends Error {
  constructor(readonly titles: readonly string[]) {
    super('Confirm the deletion: these trash entries will be destroyed as well');
    this.name = 'PurgeConfirmationRequiredError';
  }

  /**
   * Причина первой строкой, дальше заголовки: `message` уже умеет быть массивом
   * строк, поэтому перечень едет туда и единый формат ошибок не меняется.
   * Заголовки не подставляются и не обрезаются — это дело интерфейса.
   */
  toMessage(): string[] {
    return [this.message, ...this.titles];
  }
}
