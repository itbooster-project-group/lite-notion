/** Авторитетный отказ API: решение принято, повторять незачем. */
export class ApiDeniedError extends Error {
  constructor(readonly status: number) {
    super('API denied the request');
  }
}
