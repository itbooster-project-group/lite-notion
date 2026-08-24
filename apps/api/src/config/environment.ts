import { plainToInstance, Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
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
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> & EnvironmentConfig {
  const validatedEnvironment = plainToInstance(EnvironmentConfig, {
    ACCESS_TOKEN_TTL_S: environment.ACCESS_TOKEN_TTL_S,
    BCRYPT_ROUNDS: environment.BCRYPT_ROUNDS,
    CORS_ORIGIN: environment.CORS_ORIGIN,
    DATABASE_CONNECTION_TIMEOUT_MS: environment.DATABASE_CONNECTION_TIMEOUT_MS,
    DATABASE_URL: environment.DATABASE_URL,
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

  return {
    ...environment,
    ...validatedEnvironment,
  };
}
