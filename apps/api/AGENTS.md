# API Application Guidelines

## Scope

These instructions apply to `apps/api` and extend the repository-level `AGENTS.md`. Follow the root rules for workspace dependencies, OpenSpec, documentation language, and required checks.

## Architecture

- Organize backend functionality as focused NestJS modules aligned with product or infrastructure boundaries.
- Keep controllers limited to transport concerns: routing, input extraction, validation handoff, and response mapping. Put business rules and orchestration in services or use-case classes.
- Keep framework and external-system details at module boundaries so core behavior can be tested without starting the HTTP server.
- Prefer constructor injection and explicit module exports over service locators or global mutable state.
- Preserve the current bootstrap contract: `NODE_ENV`, `PORT`, and `CORS_ORIGIN` are all required and validated; `apps/api/.env.example` provides the recommended local values.
- Keep `GET /api/v1/health` lightweight and free of sensitive configuration. Expand its checks only when the corresponding dependencies are introduced by an approved change.
- Keep application routes under the `/api/v1` global prefix. Swagger UI at `/api/docs` and OpenAPI JSON at `/api/openapi.json` remain disabled in production.

The current API intentionally has no PostgreSQL, Prisma, Redis, BullMQ, Socket.IO, authentication, or authorization setup. Do not add these planned technologies without an approved OpenSpec change.

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
- `pnpm --filter @lite-notion/api build`: compile the production output.
- `pnpm lint`: run the repository Biome check from the root.

Keep NestJS-specific compiler and build settings in this application. Do not push decorator, module, or emit options into the shared TypeScript baseline.
