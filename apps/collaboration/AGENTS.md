# Collaboration Application Guidelines

## Scope

These instructions apply to `apps/collaboration` and extend the repository-level `AGENTS.md`.

## Runtime

- Keep Hocuspocus hooks small and explicit. Authentication and page access are admission concerns in `onAuthenticate`; persistence hooks must not re-authorize a user from connection context.
- Persist only opaque Yjs binary state. Do not convert documents to TipTap JSON for storage.
- Never access the database directly. Page access and document content come from the API's internal routes; the process holds no database connection and no signing secret.
- Validate configuration at process startup and avoid printing secrets, database credentials, access tokens or document payloads.
- Shut down by destroying the Hocuspocus server; there is no database client to disconnect.

## Testing

- Co-locate Vitest tests as `*.spec.ts`.
- Prefer deterministic unit tests for config, auth, room parsing, access checks and persistence invariants.
- Integration-style collaboration tests may start an in-process Hocuspocus server, but must not require external network services beyond the local test database setup required by the change.
