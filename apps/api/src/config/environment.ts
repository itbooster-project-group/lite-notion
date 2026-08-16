import { plainToInstance, Transform } from "class-transformer";
import {
  IsEnum,
  IsInt,
  Max,
  Min,
  ValidateBy,
  type ValidationOptions,
  validateSync,
} from "class-validator";

export enum NodeEnvironment {
  Development = "development",
  Production = "production",
  Test = "test",
}

export const DEFAULT_API_PORT = 3001;
export const DEFAULT_CORS_ORIGIN = "http://localhost:3000";

function isHttpOrigin(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin === value &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function IsHttpOrigin(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: "isHttpOrigin",
      validator: {
        defaultMessage: () => "$property must be an HTTP(S) origin without path, query or fragment",
        validate: isHttpOrigin,
      },
    },
    validationOptions,
  );
}

export class EnvironmentConfig {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @Transform(({ value }) => (value === undefined ? DEFAULT_API_PORT : Number(value)), {
    toClassOnly: true,
  })
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT = DEFAULT_API_PORT;

  @IsHttpOrigin()
  CORS_ORIGIN = DEFAULT_CORS_ORIGIN;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> & EnvironmentConfig {
  const validatedEnvironment = plainToInstance(
    EnvironmentConfig,
    {
      CORS_ORIGIN: environment.CORS_ORIGIN,
      NODE_ENV: environment.NODE_ENV,
      PORT: environment.PORT,
    },
    { exposeDefaultValues: true },
  );
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

    throw new Error(`Environment validation failed: ${messages.join("; ")}`);
  }

  return {
    ...environment,
    ...validatedEnvironment,
  };
}
