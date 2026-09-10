export class OriginValidationError extends Error {
  constructor() {
    super('Origin is not allowed');
  }
}

export function assertAllowedOrigin(headers: Headers, allowedOrigin: string): void {
  const origin = headers.get('origin');

  if (origin !== allowedOrigin) {
    throw new OriginValidationError();
  }
}
