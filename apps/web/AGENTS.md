# Web Application Guidelines

## Scope

These instructions apply to `apps/web` and extend the repository-level `AGENTS.md`. Follow the root rules for workspace dependencies, OpenSpec, documentation language, and required checks.

## Architecture

- This application uses Next.js App Router under the root `app` directory. Keep route files limited to framework entrypoints, metadata, and composition through FSD public APIs.
- Use Server Components by default. Add `"use client"` only at the smallest boundary that needs interaction, browser APIs, or client-side state.
- Keep application-wide providers under `src/_app` and reusable infrastructure or UI under `src/shared`. The scoped Steiger exception permits the intentional `_app` prefix while leaving import and public-API rules enabled.
- Keep route files focused on routing and composition. Move reusable product behavior into the appropriate FSD modules as features are introduced and import them through their public APIs.
- Introduce only the FSD layers required by implemented behavior, such as `shared`, `entities`, `features`, or `widgets`; do not create empty placeholder layers.
- Preserve the `@/*` alias for imports from `src` and avoid deep relative imports across future slice boundaries.
- Keep accessibility in the component contract: prefer semantic elements, accessible names, and keyboard-compatible interactions.

Tailwind CSS and shadcn/ui provide the styling and shared UI foundation. Import project wrappers through `src/shared/ui` instead of importing generated shadcn primitives directly from route or product code. TanStack Query is the server-state boundary and generated API hooks live under `src/shared/api/generated`; update generated files through the root `pnpm api:generate` command. Zustand, React Hook Form, and Zod remain absent until an approved change requires them.

MSW handlers are generated from the API snapshot and shared by Vitest and the opt-in development browser worker. Keep browser mocking disabled by default, fail tests on unhandled API requests, and override handlers per test instead of duplicating endpoint mocks.

## Testing

- Use Vitest with jsdom and React Testing Library.
- Co-locate tests with the source as `*.spec.ts` or `*.spec.tsx`.
- Test observable behavior through accessible queries such as roles and names rather than implementation details.
- Keep explicit Vitest imports and clean up rendered components between tests.

## Commands

- `pnpm --filter @lite-notion/web dev`: start the frontend on port 3000.
- `pnpm --filter @lite-notion/web typecheck`: run the web TypeScript check.
- `pnpm --filter @lite-notion/web test`: run the web test suite.
- `pnpm --filter @lite-notion/web api:generate`: regenerate the typed client and MSW handlers from the committed API snapshot.
- `pnpm --filter @lite-notion/web build`: create the production build.
- `pnpm lint`: run the repository Biome check from the root.

Do not edit generated `next-env.d.ts`. Keep `agentRules: false` in `next.config.ts` so Next.js does not overwrite the manually maintained agent instructions.
