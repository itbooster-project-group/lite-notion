import { registerAs } from '@nestjs/config';

import { type NodeEnvironment, validateEnvironment } from './environment';

export interface ApplicationConfig {
  assets: {
    gcBatchSize: number;
    gcEnabled: boolean;
    gcIntervalSeconds: number;
    maxConcurrentUploads: number;
    maxUploadBytes: number;
    orphanGraceHours: number;
    pendingTtlHours: number;
    projectionStaleWarningSeconds: number;
    readUrlTtlSeconds: number;
    s3RequestTimeoutMs: number;
    uploadTimeoutMs: number;
    s3: {
      accessKeyId: string;
      bucket: string;
      endpoint: string;
      forcePathStyle: boolean;
      region: string;
      secretAccessKey: string;
    } | null;
  };
  accessTokenTtlS: number;
  bcryptRounds: number;
  collaborationBaseUrl: string;
  collaborationTimeoutMs: number;
  corsOrigin: string;
  databaseConnectionTimeoutMs: number;
  databaseUrl: string;
  internalServiceToken: string;
  jwtSecret: string;
  nodeEnvironment: NodeEnvironment;
  port: number;
  publicationRevalidation: {
    url: string;
    token: string;
    timeoutMs: number;
  } | null;
  refreshTokenTtlS: number;
}

export function createApplicationConfig(environment: Record<string, unknown>): ApplicationConfig {
  const validatedEnvironment = validateEnvironment(environment);

  return {
    assets: {
      gcBatchSize: validatedEnvironment.ASSETS_GC_BATCH_SIZE ?? 50,
      gcEnabled: validatedEnvironment.ASSETS_GC_ENABLED ?? false,
      gcIntervalSeconds: validatedEnvironment.ASSETS_GC_INTERVAL_SECONDS ?? 60,
      maxConcurrentUploads: validatedEnvironment.ASSETS_MAX_CONCURRENT_UPLOADS ?? 4,
      maxUploadBytes: validatedEnvironment.ASSETS_MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024,
      orphanGraceHours: validatedEnvironment.ASSETS_ORPHAN_GRACE_HOURS ?? 24,
      pendingTtlHours: validatedEnvironment.ASSETS_PENDING_TTL_HOURS ?? 24,
      projectionStaleWarningSeconds:
        validatedEnvironment.ASSETS_PROJECTION_STALE_WARNING_SECONDS ?? 300,
      readUrlTtlSeconds: validatedEnvironment.ASSETS_READ_URL_TTL_SECONDS ?? 60,
      s3RequestTimeoutMs: validatedEnvironment.ASSETS_S3_REQUEST_TIMEOUT_MS ?? 15_000,
      uploadTimeoutMs: validatedEnvironment.ASSETS_UPLOAD_TIMEOUT_MS ?? 120_000,
      s3:
        validatedEnvironment.ASSETS_S3_ENDPOINT &&
        validatedEnvironment.ASSETS_S3_REGION &&
        validatedEnvironment.ASSETS_S3_BUCKET &&
        validatedEnvironment.ASSETS_S3_ACCESS_KEY_ID &&
        validatedEnvironment.ASSETS_S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: validatedEnvironment.ASSETS_S3_ACCESS_KEY_ID,
              bucket: validatedEnvironment.ASSETS_S3_BUCKET,
              endpoint: validatedEnvironment.ASSETS_S3_ENDPOINT,
              forcePathStyle: validatedEnvironment.ASSETS_S3_FORCE_PATH_STYLE ?? false,
              region: validatedEnvironment.ASSETS_S3_REGION,
              secretAccessKey: validatedEnvironment.ASSETS_S3_SECRET_ACCESS_KEY,
            }
          : null,
    },
    accessTokenTtlS: validatedEnvironment.ACCESS_TOKEN_TTL_S,
    bcryptRounds: validatedEnvironment.BCRYPT_ROUNDS,
    collaborationBaseUrl: validatedEnvironment.COLLABORATION_BASE_URL,
    collaborationTimeoutMs: validatedEnvironment.COLLABORATION_TIMEOUT_MS,
    corsOrigin: validatedEnvironment.CORS_ORIGIN,
    databaseConnectionTimeoutMs: validatedEnvironment.DATABASE_CONNECTION_TIMEOUT_MS,
    databaseUrl: validatedEnvironment.DATABASE_URL,
    internalServiceToken: validatedEnvironment.INTERNAL_SERVICE_TOKEN,
    jwtSecret: validatedEnvironment.JWT_SECRET,
    nodeEnvironment: validatedEnvironment.NODE_ENV,
    port: validatedEnvironment.PORT,
    publicationRevalidation:
      validatedEnvironment.PUBLICATION_REVALIDATION_URL &&
      validatedEnvironment.PUBLICATION_REVALIDATION_TOKEN
        ? {
            token: validatedEnvironment.PUBLICATION_REVALIDATION_TOKEN,
            timeoutMs: validatedEnvironment.PUBLICATION_REVALIDATION_TIMEOUT_MS ?? 5_000,
            url: validatedEnvironment.PUBLICATION_REVALIDATION_URL,
          }
        : null,
    refreshTokenTtlS: validatedEnvironment.REFRESH_TOKEN_TTL_S,
  };
}

export const applicationConfig = registerAs('application', () =>
  createApplicationConfig(process.env),
);
