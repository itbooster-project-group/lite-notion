import { describe, expect, it } from "vitest";

import { createApplicationConfig } from "./application-config";
import { NodeEnvironment } from "./environment";

describe("createApplicationConfig", () => {
  it("маппит конфигурацию из env-шаблона во внутренний контракт", () => {
    expect(
      createApplicationConfig({
        CORS_ORIGIN: "http://localhost:3000",
        NODE_ENV: "development",
        PORT: "3001",
      }),
    ).toEqual({
      corsOrigin: "http://localhost:3000",
      nodeEnvironment: NodeEnvironment.Development,
      port: 3001,
    });
  });

  it("валидирует и маппит пользовательскую конфигурацию", () => {
    expect(
      createApplicationConfig({
        CORS_ORIGIN: "https://notes.example.com",
        NODE_ENV: "production",
        PORT: "4100",
        UNRELATED_VALUE: "not-mapped",
      }),
    ).toEqual({
      corsOrigin: "https://notes.example.com",
      nodeEnvironment: NodeEnvironment.Production,
      port: 4100,
    });
  });

  it("отклоняет невалидное окружение до создания runtime-конфига", () => {
    expect(() =>
      createApplicationConfig({
        CORS_ORIGIN: "http://localhost:3000",
        NODE_ENV: "development",
        PORT: "not-a-number",
      }),
    ).toThrowError(/Environment validation failed: PORT/);
  });
});
