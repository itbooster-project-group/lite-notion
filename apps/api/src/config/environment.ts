import { plainToInstance, Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  Max,
  Min,
  ValidateBy,
  type ValidationOptions,
  validateSync,
} from 'class-validator';

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
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> & EnvironmentConfig {
  const validatedEnvironment = plainToInstance(EnvironmentConfig, {
    CORS_ORIGIN: environment.CORS_ORIGIN,
    DATABASE_CONNECTION_TIMEOUT_MS: environment.DATABASE_CONNECTION_TIMEOUT_MS,
    DATABASE_URL: environment.DATABASE_URL,
    NODE_ENV: environment.NODE_ENV,
    PORT: environment.PORT,
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
