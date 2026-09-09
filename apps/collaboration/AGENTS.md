# Collaboration Application Guidelines

## Scope

These instructions apply to `apps/collaboration` and extend the repository-level `AGENTS.md`.

## Runtime

- Keep Hocuspocus hooks small and explicit. Authentication and page access are admission concerns in `onAuthenticate`; persistence hooks must not re-authorize a user from connection context.
- Persist only opaque Yjs binary state. Do not convert documents to TipTap JSON for storage.
- Keep database access through `@lite-notion/database`. Do not import NestJS API modules or API repositories.
- Validate configuration at process startup and avoid printing secrets, database credentials, access tokens or document payloads.
- Shut down by destroying the Hocuspocus server first and disconnecting Prisma afterwards.

## Testing

- Co-locate Vitest tests as `*.spec.ts`.
- Prefer deterministic unit tests for config, auth, room parsing, access checks and persistence invariants.
- Integration-style collaboration tests may start an in-process Hocuspocus server, but must not require external network services beyond the local test database setup required by the change.
