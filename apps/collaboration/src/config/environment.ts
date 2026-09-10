export type NodeEnvironment = 'development' | 'production' | 'test';

export interface CollaborationConfig {
  allowedOrigin: string;
  databaseConnectionTimeoutMs: number;
  databaseUrl: string;
  jwtSecret: string;
  nodeEnvironment: NodeEnvironment;
  port: number;
  websocketMaxPayloadBytes: number;
}

const nodeEnvironments = new Set<NodeEnvironment>(['development', 'production', 'test']);
const jwtSecretMinLength = 32;

function parseInteger(name: string, value: unknown, min: number, max: number): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Environment validation failed: ${name}`);
  }

  return parsed;
}

function validateHttpOrigin(name: string, value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error(`Environment validation failed: ${name}`);
  }

  try {
    const url = new URL(value);

    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === ''
    ) {
      return value;
    }
  } catch {
    // Ошибка ниже намеренно не включает исходное значение.
  }

  throw new Error(`Environment validation failed: ${name}`);
}

function validatePostgreSqlUrl(name: string, value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error(`Environment validation failed: ${name}`);
  }

  try {
    const url = new URL(value);

    if ((url.protocol === 'postgresql:' || url.protocol === 'postgres:') && url.hostname !== '') {
      return value;
    }
  } catch {
    // Ошибка ниже намеренно не включает исходное значение.
  }

  throw new Error(`Environment validation failed: ${name}`);
}

function validateJwtSecret(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.length < jwtSecretMinLength) {
    throw new Error(`Environment validation failed: ${name}`);
  }

  return value;
}

function validateNodeEnvironment(value: unknown): NodeEnvironment {
  if (typeof value === 'string' && nodeEnvironments.has(value as NodeEnvironment)) {
    return value as NodeEnvironment;
  }

  throw new Error('Environment validation failed: NODE_ENV');
}

export function createCollaborationConfig(
  environment: Record<string, unknown>,
): CollaborationConfig {
  return {
    allowedOrigin: validateHttpOrigin(
      'COLLABORATION_ALLOWED_ORIGIN',
      environment.COLLABORATION_ALLOWED_ORIGIN,
    ),
    databaseConnectionTimeoutMs: parseInteger(
      'DATABASE_CONNECTION_TIMEOUT_MS',
      environment.DATABASE_CONNECTION_TIMEOUT_MS,
      1,
      60_000,
    ),
    databaseUrl: validatePostgreSqlUrl('DATABASE_URL', environment.DATABASE_URL),
    jwtSecret: validateJwtSecret('JWT_SECRET', environment.JWT_SECRET),
    nodeEnvironment: validateNodeEnvironment(environment.NODE_ENV),
    port: parseInteger('PORT', environment.PORT, 1, 65_535),
    websocketMaxPayloadBytes: parseInteger(
      'WEBSOCKET_MAX_PAYLOAD_BYTES',
      environment.WEBSOCKET_MAX_PAYLOAD_BYTES,
      1,
      10 * 1024 * 1024,
    ),
  };
}
