export type NodeEnvironment = 'development' | 'production' | 'test';

export interface CollaborationConfig {
  allowedOrigin: string;
  apiBaseUrl: string;
  apiTimeoutMs: number;
  internalServiceToken: string;
  nodeEnvironment: NodeEnvironment;
  port: number;
  redisHost: string;
  redisPort: number;
  websocketMaxPayloadBytes: number;
}

const nodeEnvironments = new Set<NodeEnvironment>(['development', 'production', 'test']);
const serviceTokenMinLength = 32;

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

function validateHostname(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Environment validation failed: ${name}`);
  }

  return value;
}

function validateServiceToken(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.length < serviceTokenMinLength) {
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
    apiBaseUrl: validateHttpOrigin('API_BASE_URL', environment.API_BASE_URL),
    apiTimeoutMs: parseInteger('API_TIMEOUT_MS', environment.API_TIMEOUT_MS, 1, 60_000),
    internalServiceToken: validateServiceToken(
      'INTERNAL_SERVICE_TOKEN',
      environment.INTERNAL_SERVICE_TOKEN,
    ),
    nodeEnvironment: validateNodeEnvironment(environment.NODE_ENV),
    port: parseInteger('PORT', environment.PORT, 1, 65_535),
    redisHost: validateHostname('REDIS_HOST', environment.REDIS_HOST),
    redisPort: parseInteger('REDIS_PORT', environment.REDIS_PORT, 1, 65_535),
    websocketMaxPayloadBytes: parseInteger(
      'WEBSOCKET_MAX_PAYLOAD_BYTES',
      environment.WEBSOCKET_MAX_PAYLOAD_BYTES,
      1,
      10 * 1024 * 1024,
    ),
  };
}
