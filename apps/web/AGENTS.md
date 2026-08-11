# Web Application Guidelines

## Scope

These instructions apply to `apps/web` and extend the repository-level `AGENTS.md`. Follow the root rules for workspace dependencies, OpenSpec, documentation language, and required checks.

## Architecture

- This application uses Next.js App Router under `src/app`.
- Use Server Components by default. Add `"use client"` only at the smallest boundary that needs interaction, browser APIs, or client-side state.
- Keep route files focused on routing and composition. Move reusable product behavior into Feature Sliced Design modules as features are introduced.
- Introduce only the FSD layers required by implemented behavior, such as `shared`, `entities`, `features`, or `widgets`; do not create empty placeholder layers.
- Preserve the `@/*` alias for imports from `src` and avoid deep relative imports across future slice boundaries.
- Keep accessibility in the component contract: prefer semantic elements, accessible names, and keyboard-compatible interactions.

The current application intentionally has no Tailwind, shadcn/ui, TanStack Query, Zustand, React Hook Form, or Zod setup. Do not add these planned technologies until an approved change requires them.

## Testing

- Use Vitest with jsdom and React Testing Library.
- Co-locate tests with the source as `*.spec.ts` or `*.spec.tsx`.
- Test observable behavior through accessible queries such as roles and names rather than implementation details.
- Keep explicit Vitest imports and clean up rendered components between tests.

## Commands

- `pnpm --filter @lite-notion/web dev`: start the frontend on port 3000.
- `pnpm --filter @lite-notion/web typecheck`: run the web TypeScript check.
- `pnpm --filter @lite-notion/web test`: run the web test suite.
- `pnpm --filter @lite-notion/web build`: create the production build.
- `pnpm lint`: run the repository Biome check from the root.

Do not edit generated `next-env.d.ts`. Keep `agentRules: false` in `next.config.ts` so Next.js does not overwrite the manually maintained agent instructions.
