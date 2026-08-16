import { describe, expect, it } from "vitest";

import {
  DEFAULT_API_PORT,
  DEFAULT_CORS_ORIGIN,
  NodeEnvironment,
  validateEnvironment,
} from "./environment";

describe("validateEnvironment", () => {
  it("применяет конфигурацию по умолчанию", () => {
    expect(validateEnvironment({})).toMatchObject({
      CORS_ORIGIN: DEFAULT_CORS_ORIGIN,
      NODE_ENV: NodeEnvironment.Development,
      PORT: DEFAULT_API_PORT,
    });
  });

  it("преобразует допустимую пользовательскую конфигурацию", () => {
    expect(
      validateEnvironment({
        CORS_ORIGIN: "https://notes.example.com",
        NODE_ENV: "production",
        PORT: "4100",
        UNRELATED_VALUE: "preserved",
      }),
    ).toMatchObject({
      CORS_ORIGIN: "https://notes.example.com",
      NODE_ENV: NodeEnvironment.Production,
      PORT: 4100,
      UNRELATED_VALUE: "preserved",
    });
  });

  it.each([
    ["NODE_ENV", { NODE_ENV: "staging" }],
    ["PORT", { PORT: "not-a-number" }],
    ["PORT", { PORT: "0" }],
    ["PORT", { PORT: "65536" }],
    ["CORS_ORIGIN", { CORS_ORIGIN: "ftp://localhost:3000" }],
    ["CORS_ORIGIN", { CORS_ORIGIN: "http://localhost:3000/path?token=secret" }],
  ])("отклоняет невалидный %s", (property, environment) => {
    expect(() => validateEnvironment(environment)).toThrowError(
      new RegExp(`Environment validation failed: ${property}`),
    );
  });

  it("не раскрывает исходные значения в ошибке", () => {
    expect(() =>
      validateEnvironment({
        CORS_ORIGIN: "http://localhost:3000/path?token=secret-value",
      }),
    ).toThrowError(/^(?!.*secret-value).*Environment validation failed: CORS_ORIGIN/);
  });
});
