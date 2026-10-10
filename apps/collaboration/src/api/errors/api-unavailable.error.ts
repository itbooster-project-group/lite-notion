/** Вердикт получить не удалось. */
export class ApiUnavailableError extends Error {
  constructor(readonly reason: string) {
    super('API is unavailable');
  }
}
