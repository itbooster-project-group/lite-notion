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

Tailwind CSS v4 and shadcn/ui are configured for this application. Keep shadcn CLI-managed
components in the vendor zone at `src/shared/ui/shadcn/`; do not customize those files manually.
For every vendor component used by the application, maintain a same-named customizable wrapper in
`src/shared/ui/*.tsx`. Put project defaults and custom styles in these wrappers, merge consumer
`className` values with `cn()`, and preserve the vendor component's supported props. Export wrappers
through the public `@/shared/ui` API and use only that API from application code.

Add or update vendor components from the repository root with
`pnpm dlx shadcn@latest add <component> -c apps/web`. CLI writes and overwrites must stay inside
`src/shared/ui/shadcn/` so wrapper customizations remain intact. Dark mode is class-based and is
applied by `next-themes` through the root theme provider.

TanStack Query, Zustand, React Hook Form, and Zod are not configured yet. Do not add them until an
approved change requires them.

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
