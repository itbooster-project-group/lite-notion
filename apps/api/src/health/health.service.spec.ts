import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service";
import { HealthService } from "./health.service";

describe("HealthService", () => {
  it("возвращает health после успешной проверки базы", async () => {
    const prisma = { checkConnection: vi.fn(async () => undefined) } as unknown as PrismaService;
    const service = new HealthService(prisma);

    await expect(service.getHealth()).resolves.toEqual({
      status: "ok",
      database: "up",
    });
  });

  it("заменяет database error безопасным 503", async () => {
    const prisma = {
      checkConnection: vi.fn(async () => {
        throw new Error("postgresql://admin:secret@database.internal/notes");
      }),
    } as unknown as PrismaService;
    const service = new HealthService(prisma);

    await expect(service.getHealth()).rejects.toEqual(
      new ServiceUnavailableException("Database is unavailable"),
    );
  });
});
