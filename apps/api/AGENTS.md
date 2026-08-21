# API Application Guidelines

## Scope

These instructions apply to `apps/api` and extend the repository-level `AGENTS.md`. Follow the root rules for workspace dependencies, OpenSpec, documentation language, and required checks.

## Architecture

- Organize backend functionality as focused NestJS modules aligned with product or infrastructure boundaries.
- Keep controllers limited to transport concerns: routing, input extraction, validation handoff, and response mapping. Put business rules and orchestration in services or use-case classes.
- Keep framework and external-system details at module boundaries so core behavior can be tested without starting the HTTP server.
- Prefer constructor injection and explicit module exports over service locators or global mutable state.
- Preserve the current bootstrap contract: `NODE_ENV`, `PORT`, `CORS_ORIGIN`, `DATABASE_URL`, and `DATABASE_CONNECTION_TIMEOUT_MS` are all required and validated; `apps/api/.env.example` provides the recommended local values.
- Read runtime environment only at configuration boundaries. Application modules and services must use the injected `ApplicationConfig`; standalone tooling such as Prisma CLI may read its own environment directly.
- Keep `GET /api/v1/health` as the single database-aware health endpoint. It must return bounded, safe failures without connection details; do not add a separate readiness route.
- Keep application routes under the `/api/v1` global prefix. Swagger UI at `/api/docs` and OpenAPI JSON at `/api/openapi.json` remain disabled in production.

PostgreSQL access is owned by `DatabaseModule` and `PrismaService`. Keep Prisma lazy so the API process can start during database outages and report them through health, and do not add product models or migrations without an approved OpenSpec change. Redis, BullMQ, Socket.IO, authentication, and authorization are still intentionally absent.

The committed `openapi.json` snapshot is generated from Nest metadata. After changing controllers, DTOs, or Swagger decorators, run `pnpm api:generate` from the repository root and commit both the snapshot and generated web output. Never edit generated artifacts manually.

## Testing

- Use Vitest in the Node environment with Nest testing utilities.
- Co-locate unit tests with the source as `*.spec.ts`.
- Build the smallest Nest testing module needed for the behavior under test.
- Test controllers through their public methods for unit coverage; add HTTP-level tests only when routing, middleware, guards, or serialization behavior requires them.
- Do not depend on live databases, caches, queues, or network services in unit tests.

## Commands

- `pnpm --filter @lite-notion/api dev`: start the API in watch mode.
- `pnpm --filter @lite-notion/api typecheck`: run the API TypeScript check.
- `pnpm --filter @lite-notion/api test`: run the API test suite.
- `pnpm --filter @lite-notion/api prisma:generate`: regenerate the ignored Prisma Client output.
- `pnpm --filter @lite-notion/api build`: compile the production output.
- `pnpm lint`: run the repository Biome check from the root.

Keep NestJS-specific compiler and build settings in this application. Do not push decorator, module, or emit options into the shared TypeScript baseline.
