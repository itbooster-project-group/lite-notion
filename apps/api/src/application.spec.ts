import { Body, Controller, Get, type INestApplication, Logger, Post } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Type } from "class-transformer";
import { IsInt } from "class-validator";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppModule } from "./app.module";
import { configureApplication } from "./application";
import { NodeEnvironment } from "./config/environment";

class TestPayloadDto {
  @Type(() => Number)
  @IsInt()
  count!: number;
}

@Controller("_test")
class TestController {
  @Get("error")
  getError(): never {
    throw new Error("sensitive internal failure");
  }

  @Post("validate")
  validate(@Body() payload: TestPayloadDto) {
    return {
      count: payload.count,
      isInstance: payload instanceof TestPayloadDto,
    };
  }
}

describe("application HTTP configuration", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApplication(app, {
      CORS_ORIGIN: "http://localhost:3000",
      NODE_ENV: NodeEnvironment.Test,
    });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it("публикует health только под versioned prefix", async () => {
    await request(app.getHttpServer()).get("/api/v1/health").expect(200).expect({ status: "ok" });

    const response = await request(app.getHttpServer()).get("/health").expect(404);

    expect(response.body).toMatchObject({
      error: "Not Found",
      message: "Cannot GET /health",
      path: "/health",
      statusCode: 404,
    });
    expect(response.body.timestamp).toEqual(expect.any(String));
  });

  it("разрешает CORS только настроенному origin без credentials", async () => {
    const allowedResponse = await request(app.getHttpServer())
      .options("/api/v1/health")
      .set("Access-Control-Request-Method", "GET")
      .set("Origin", "http://localhost:3000")
      .expect(204);

    expect(allowedResponse.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(allowedResponse.headers["access-control-allow-credentials"]).toBeUndefined();

    const rejectedResponse = await request(app.getHttpServer())
      .get("/api/v1/health")
      .set("Origin", "https://untrusted.example")
      .expect(200);

    expect(rejectedResponse.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("преобразует DTO и отклоняет лишние поля", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/_test/validate")
      .send({ count: "5" })
      .expect(201)
      .expect({ count: 5, isInstance: true });

    const response = await request(app.getHttpServer())
      .post("/api/v1/_test/validate")
      .send({ count: "5", extra: true })
      .expect(400);

    expect(response.body).toMatchObject({
      error: "Bad Request",
      path: "/api/v1/_test/validate",
      statusCode: 400,
    });
    expect(response.body.message).toContain("property extra should not exist");
  });

  it("скрывает внутренние детали неожиданных ошибок и логирует исключение", async () => {
    const logger = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const response = await request(app.getHttpServer()).get("/api/v1/_test/error").expect(500);

    expect(response.body).toMatchObject({
      error: "Internal Server Error",
      message: "Internal server error",
      path: "/api/v1/_test/error",
      statusCode: 500,
    });
    expect(JSON.stringify(response.body)).not.toContain("sensitive internal failure");
    expect(logger).toHaveBeenCalledWith(
      "sensitive internal failure",
      expect.stringContaining("sensitive internal failure"),
    );
  });

  it("публикует Swagger UI и только OpenAPI JSON вне production", async () => {
    const uiResponse = await request(app.getHttpServer()).get("/api/docs").expect(200);

    expect(uiResponse.headers["content-type"]).toContain("text/html");

    const documentResponse = await request(app.getHttpServer())
      .get("/api/openapi.json")
      .expect(200);

    expect(documentResponse.body).toMatchObject({
      info: {
        title: "Lite Notion API",
        version: "1.0",
      },
      openapi: expect.any(String),
    });
    expect(documentResponse.body.paths["/api/v1/health"].get).toMatchObject({
      responses: {
        200: {
          content: {
            "application/json": {
              schema: {
                properties: {
                  status: {
                    example: "ok",
                    type: "string",
                  },
                },
                required: ["status"],
                type: "object",
              },
            },
          },
        },
      },
      summary: "Check API availability",
      tags: ["health"],
    });

    const yamlResponse = await request(app.getHttpServer()).get("/api/docs-yaml").expect(404);

    expect(yamlResponse.body).toMatchObject({
      error: "Not Found",
      path: "/api/docs-yaml",
      statusCode: 404,
    });
  });

  it("не публикует Swagger endpoints в production", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const productionApp = moduleRef.createNestApplication();

    configureApplication(productionApp, {
      CORS_ORIGIN: "http://localhost:3000",
      NODE_ENV: NodeEnvironment.Production,
    });
    await productionApp.init();

    try {
      const uiResponse = await request(productionApp.getHttpServer()).get("/api/docs").expect(404);
      const documentResponse = await request(productionApp.getHttpServer())
        .get("/api/openapi.json")
        .expect(404);

      expect(uiResponse.body).toMatchObject({
        error: "Not Found",
        path: "/api/docs",
        statusCode: 404,
      });
      expect(documentResponse.body).toMatchObject({
        error: "Not Found",
        path: "/api/openapi.json",
        statusCode: 404,
      });
    } finally {
      await productionApp.close();
    }
  });
});
