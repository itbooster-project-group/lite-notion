# API Application Guidelines

## Scope

These instructions apply to `apps/api` and extend the repository-level `AGENTS.md`. Follow the root rules for workspace dependencies, OpenSpec, documentation language, and required checks.

## Architecture

- Organize backend functionality as focused NestJS modules aligned with product or infrastructure boundaries.
- Keep controllers limited to transport concerns: routing, input extraction, validation handoff, and response mapping. Put business rules and orchestration in services or use-case classes.
- Keep framework and external-system details at module boundaries so core behavior can be tested without starting the HTTP server.
- Prefer constructor injection and explicit module exports over service locators or global mutable state.
- Preserve the current bootstrap contract: `NODE_ENV`, `PORT`, `CORS_ORIGIN`, `DATABASE_URL`, `DATABASE_CONNECTION_TIMEOUT_MS`, `JWT_SECRET`, `ACCESS_TOKEN_TTL_S`, `REFRESH_TOKEN_TTL_S`, and `BCRYPT_ROUNDS` are all required and validated; `apps/api/.env.example` provides the recommended local values. Configuration errors must never print the value of `JWT_SECRET`.
- Read runtime environment only at configuration boundaries. Application modules and services must use the injected `ApplicationConfig`; standalone tooling such as Prisma CLI may read its own environment directly.
- Keep `GET /api/v1/health` as the single database-aware health endpoint. It must return bounded, safe failures without connection details; do not add a separate readiness route.
- Keep application routes under the `/api/v1` global prefix. Swagger UI at `/api/docs` and OpenAPI JSON at `/api/openapi.json` remain disabled in production.
- Routes are closed by default: `JwtAuthGuard` is registered as `APP_GUARD` and every route requires a valid access token unless it is explicitly marked with `@Public()`. Never invert this by guarding individual routes instead — a forgotten `@Public()` returns a visible `401`, while a forgotten guard would silently expose data.
- Cross-origin credentials are enabled so the browser sends the refresh cookie to `/api/v1/auth`. The origin check stays an exact match against `CORS_ORIGIN`; `Access-Control-Allow-Origin` must never become a wildcard.

PostgreSQL access is owned by `DatabaseModule` and `PrismaService`. Keep Prisma lazy so the API process can start during database outages and report them through health, and do not add product models or migrations without an approved OpenSpec change. Redis, BullMQ, and Socket.IO are still intentionally absent; scheduled work runs in-process through `@nestjs/schedule`.

Authentication is owned by `AuthModule`. Access tokens are signed JWTs verified without touching the database; refresh tokens are opaque, stored only as SHA-256 hashes, and rotated on every use. Each login opens its own rotation chain (`familyId`), and **at most one session per chain may have `revokedAt = null`** — that invariant is held by the `SELECT ... FOR UPDATE` transaction in `session.repository.ts` and is what makes refresh-token reuse detectable. Do not move rotation out of its transaction, do not replace the lock with an optimistic check, and do not delete rotation-revoked rows: breaking any of these silently disables reuse detection without failing an obvious test.

## Transactions, locks and use cases

Transactions are owned by use-case classes, never by repositories. `TransactionRunner` (`src/database/transaction.ts`) is the only place that opens one, and `TransactionScope.lock` is the only place that takes an advisory lock. A check that must observe the same state as the write it guards has to run inside the same transaction, so it belongs in the use case beside that write — moving it into a repository is what previously pulled business rules into the data-access layer.

A use case exists where there is a transaction **and** at least one decision inside it: one public `execute`, private to its module, under `use-cases/`. Reads, tree assembly and single-statement writes stay in the service, which remains the module's exported face. A transaction with no decisions — `AuthRepository.rotate` — stays in its repository; do not convert it.

Repositories are data access only. Recursive CTEs stay there under intention-revealing names, but a repository must not throw a domain error, must not decide, and must not touch another module's table — `PagesRepository` owns every write to `Page`, including the cascade from project deletion. `bind(scope)` returns a **new** repository instance bound to the transaction's connection; never mutate the injected client, because the provider is a singleton shared by concurrent requests.

A use case talks to repositories directly, its own and other modules', and never through another module's service: the decisions are the use case's, and a pass-through service would only add a layer. A repository stays in its aggregate's module and is exported from it; `PagesModule` and `ProjectsModule` need each other's repository, and that cycle is resolved with `forwardRef` on both sides. Do not move a repository out of its module to dodge the cycle.

There is exactly one lock: `ownerLock` (`src/common/helpers.ts`), which serialises a single owner's writes. Every write use case takes it, so a finer-grained lock adds no exclusion — a sibling-level lock existed once and was removed for that reason. Build keys only with `ownerLock`; a key assembled on the spot serialises against the wrong set of operations.

Before adding a second lock class, prove the first one does not already cover the race — with a failing test on a live database, not by reasoning. Two classes bring back the need for a canonical acquisition order, which nothing enforces today.

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
