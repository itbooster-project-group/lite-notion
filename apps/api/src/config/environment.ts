import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateBy,
  type ValidationArguments,
  type ValidationOptions,
  validateSync,
} from 'class-validator';

const JWT_SECRET_MIN_LENGTH = 32;
const INTERNAL_SERVICE_TOKEN_MIN_LENGTH = 32;

export enum NodeEnvironment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

function isHttpOrigin(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return Number(value);
}

function IsHttpOrigin(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isHttpOrigin',
      validator: {
        defaultMessage: () => '$property must be an HTTP(S) origin without path, query or fragment',
        validate: isHttpOrigin,
      },
    },
    validationOptions,
  );
}

export class EnvironmentConfig {
  @IsEnum(NodeEnvironment)
  NODE_ENV!: NodeEnvironment;

  @Transform(({ value }) => Number(value), { toClassOnly: true })
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT!: number;

  @IsHttpOrigin()
  CORS_ORIGIN!: string;

  @IsHttpOrigin()
  COLLABORATION_BASE_URL!: string;

  @Transform(({ value }) => Number(value), { toClassOnly: true })
  @IsInt()
  @Min(1)
  @Max(60_000)
  COLLABORATION_TIMEOUT_MS!: number;

  @ValidateBy({
    name: 'isPostgreSqlUrl',
    validator: {
      defaultMessage: () =>
        'DATABASE_URL must be a PostgreSQL URL using the postgresql or postgres protocol',
      validate: (value: unknown) => {
        if (typeof value !== 'string') {
          return false;
        }

        try {
          const url = new URL(value);

          return (
            (url.protocol === 'postgresql:' || url.protocol === 'postgres:') &&
            url.hostname.length > 0
          );
        } catch {
          return false;
        }
      },
    },
  })
  DATABASE_URL!: string;

  @Transform(({ value }) => Number(value), { toClassOnly: true })
  @IsInt()
  @Min(1)
  @Max(60_000)
  DATABASE_CONNECTION_TIMEOUT_MS!: number;

  @IsString()
  @MinLength(JWT_SECRET_MIN_LENGTH)
  JWT_SECRET!: string;

  // Предъявления достаточно, чтобы писать документы, поэтому длина как у ключа подписи.
  @IsString()
  @MinLength(INTERNAL_SERVICE_TOKEN_MIN_LENGTH)
  INTERNAL_SERVICE_TOKEN!: string;

  @Transform(({ value }) => Number(value), { toClassOnly: true })
  @IsInt()
  @Min(60)
  @Max(3_600)
  ACCESS_TOKEN_TTL_S!: number;

  // Проверка отношения к ACCESS_TOKEN_TTL_S объявлена на свойстве, а не на классе:
  // ValidationArguments даёт доступ ко всему объекту, а ошибка при этом остаётся
  // привязанной к REFRESH_TOKEN_TTL_S и попадает в общий формат "property: constraint".
  @Transform(({ value }) => Number(value), { toClassOnly: true })
  @IsInt()
  @Min(3_600)
  @Max(7_776_000)
  @ValidateBy({
    name: 'isLongerThanAccessTokenTtl',
    validator: {
      defaultMessage: () => 'REFRESH_TOKEN_TTL_S must be greater than ACCESS_TOKEN_TTL_S',
      validate: (value: unknown, args?: ValidationArguments) => {
        const accessTokenTtlS = (args?.object as Partial<EnvironmentConfig> | undefined)
          ?.ACCESS_TOKEN_TTL_S;

        return (
          typeof value === 'number' &&
          typeof accessTokenTtlS === 'number' &&
          Number.isFinite(value) &&
          Number.isFinite(accessTokenTtlS) &&
          value > accessTokenTtlS
        );
      },
    },
  })
  REFRESH_TOKEN_TTL_S!: number;

  @Transform(({ value }) => Number(value), { toClassOnly: true })
  @IsInt()
  @Min(4)
  @Max(15)
  BCRYPT_ROUNDS!: number;

  @IsOptional()
  @IsString()
  ASSETS_S3_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  ASSETS_S3_REGION?: string;

  @IsOptional()
  @IsString()
  ASSETS_S3_BUCKET?: string;

  @IsOptional()
  @IsString()
  ASSETS_S3_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  ASSETS_S3_SECRET_ACCESS_KEY?: string;

  @Transform(({ value }) => optionalNumber(value), { toClassOnly: true })
  @IsOptional()
  @IsInt()
  @Min(1_000)
  @Max(120_000)
  ASSETS_S3_REQUEST_TIMEOUT_MS?: number;

  @Transform(({ value }) => optionalNumber(value), { toClassOnly: true })
  @IsOptional()
  @IsInt()
  @Min(1_000)
  @Max(600_000)
  ASSETS_UPLOAD_TIMEOUT_MS?: number;

  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value), {
    toClassOnly: true,
  })
  @IsOptional()
  @IsBoolean()
  ASSETS_S3_FORCE_PATH_STYLE?: boolean;

  @Transform(({ value }) => optionalNumber(value), { toClassOnly: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3_600)
  ASSETS_READ_URL_TTL_SECONDS?: number;

  @Transform(({ value }) => optionalNumber(value), { toClassOnly: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_485_760)
  ASSETS_MAX_UPLOAD_BYTES?: number;

  @Transform(({ value }) => optionalNumber(value), { toClassOnly: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  ASSETS_MAX_CONCURRENT_UPLOADS?: number;

  @Transform(({ value }) => optionalNumber(value), { toClassOnly: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8_760)
  ASSETS_PENDING_TTL_HOURS?: number;

  @Transform(({ value }) => optionalNumber(value), { toClassOnly: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8_760)
  ASSETS_ORPHAN_GRACE_HOURS?: number;

  @Transform(({ value }) => optionalNumber(value), { toClassOnly: true })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(86_400)
  ASSETS_GC_INTERVAL_SECONDS?: number;

  @Transform(({ value }) => optionalNumber(value), { toClassOnly: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  ASSETS_GC_BATCH_SIZE?: number;

  @Transform(({ value }) => optionalNumber(value), { toClassOnly: true })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(86_400)
  ASSETS_PROJECTION_STALE_WARNING_SECONDS?: number;

  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value), {
    toClassOnly: true,
  })
  @IsOptional()
  @IsBoolean()
  ASSETS_GC_ENABLED?: boolean;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> & EnvironmentConfig {
  const validatedEnvironment = plainToInstance(EnvironmentConfig, {
    ACCESS_TOKEN_TTL_S: environment.ACCESS_TOKEN_TTL_S,
    BCRYPT_ROUNDS: environment.BCRYPT_ROUNDS,
    CORS_ORIGIN: environment.CORS_ORIGIN,
    ASSETS_GC_BATCH_SIZE: environment.ASSETS_GC_BATCH_SIZE,
    ASSETS_GC_ENABLED: environment.ASSETS_GC_ENABLED,
    ASSETS_GC_INTERVAL_SECONDS: environment.ASSETS_GC_INTERVAL_SECONDS,
    ASSETS_MAX_CONCURRENT_UPLOADS: environment.ASSETS_MAX_CONCURRENT_UPLOADS,
    ASSETS_MAX_UPLOAD_BYTES: environment.ASSETS_MAX_UPLOAD_BYTES,
    ASSETS_ORPHAN_GRACE_HOURS: environment.ASSETS_ORPHAN_GRACE_HOURS,
    ASSETS_PENDING_TTL_HOURS: environment.ASSETS_PENDING_TTL_HOURS,
    ASSETS_PROJECTION_STALE_WARNING_SECONDS: environment.ASSETS_PROJECTION_STALE_WARNING_SECONDS,
    ASSETS_READ_URL_TTL_SECONDS: environment.ASSETS_READ_URL_TTL_SECONDS,
    ASSETS_S3_ACCESS_KEY_ID: environment.ASSETS_S3_ACCESS_KEY_ID,
    ASSETS_S3_BUCKET: environment.ASSETS_S3_BUCKET,
    ASSETS_S3_ENDPOINT: environment.ASSETS_S3_ENDPOINT,
    ASSETS_S3_FORCE_PATH_STYLE: environment.ASSETS_S3_FORCE_PATH_STYLE,
    ASSETS_S3_REGION: environment.ASSETS_S3_REGION,
    ASSETS_S3_REQUEST_TIMEOUT_MS: environment.ASSETS_S3_REQUEST_TIMEOUT_MS,
    ASSETS_S3_SECRET_ACCESS_KEY: environment.ASSETS_S3_SECRET_ACCESS_KEY,
    ASSETS_UPLOAD_TIMEOUT_MS: environment.ASSETS_UPLOAD_TIMEOUT_MS,
    COLLABORATION_BASE_URL: environment.COLLABORATION_BASE_URL,
    COLLABORATION_TIMEOUT_MS: environment.COLLABORATION_TIMEOUT_MS,
    DATABASE_CONNECTION_TIMEOUT_MS: environment.DATABASE_CONNECTION_TIMEOUT_MS,
    DATABASE_URL: environment.DATABASE_URL,
    INTERNAL_SERVICE_TOKEN: environment.INTERNAL_SERVICE_TOKEN,
    JWT_SECRET: environment.JWT_SECRET,
    NODE_ENV: environment.NODE_ENV,
    PORT: environment.PORT,
    REFRESH_TOKEN_TTL_S: environment.REFRESH_TOKEN_TTL_S,
  });
  const errors = validateSync(validatedEnvironment, {
    forbidUnknownValues: true,
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}).map(
        (constraint) => `${error.property}: ${constraint}`,
      ),
    );

    throw new Error(`Environment validation failed: ${messages.join('; ')}`);
  }

  const storageKeys = [
    'ASSETS_S3_ENDPOINT',
    'ASSETS_S3_REGION',
    'ASSETS_S3_BUCKET',
    'ASSETS_S3_ACCESS_KEY_ID',
    'ASSETS_S3_SECRET_ACCESS_KEY',
  ] as const;
  const configuredStorageKeys = storageKeys.filter((key) => {
    const value = environment[key];
    return typeof value === 'string' && value.length > 0;
  });
  if (
    (validatedEnvironment.NODE_ENV === NodeEnvironment.Production &&
      configuredStorageKeys.length !== storageKeys.length) ||
    (configuredStorageKeys.length > 0 && configuredStorageKeys.length !== storageKeys.length)
  ) {
    throw new Error(`Environment validation failed: ${storageKeys.join(', ')}`);
  }

  return {
    ...environment,
    ...validatedEnvironment,
  };
}
