import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handleBootstrapError, startApplication } from "./bootstrap";
import { NodeEnvironment } from "./config/environment";

describe("bootstrap", () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("слушает порт из ConfigService и включает shutdown hooks", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: new ConfigService({
            CORS_ORIGIN: "http://localhost:3000",
            NODE_ENV: NodeEnvironment.Test,
            PORT: 4321,
          }),
        },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    const listen = vi.spyOn(app, "listen").mockResolvedValue(undefined);
    const enableShutdownHooks = vi.spyOn(app, "enableShutdownHooks");

    await startApplication(app);

    expect(listen).toHaveBeenCalledWith(4321);
    expect(enableShutdownHooks).toHaveBeenCalledOnce();
    await app.close();
  });

  it("возвращает ненулевой exit code и скрывает неизвестную startup-ошибку", () => {
    const logger = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    handleBootstrapError(new Error("secret connection details"));

    expect(process.exitCode).toBe(1);
    expect(logger).toHaveBeenCalledWith("Failed to start API");
  });

  it("показывает безопасную ошибку env-валидации", () => {
    const logger = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const error = new Error("Environment validation failed: PORT: PORT must be an integer number");

    handleBootstrapError(error);

    expect(process.exitCode).toBe(1);
    expect(logger).toHaveBeenCalledWith(error.message);
  });
});
