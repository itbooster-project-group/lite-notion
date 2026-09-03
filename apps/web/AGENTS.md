# Web Application Guidelines

## Scope

These instructions apply to `apps/web` and extend the repository-level `AGENTS.md`. Follow the root rules for workspace dependencies, OpenSpec, documentation language, and required checks.

## Architecture

- This application uses Next.js App Router under the root `app` directory. Keep route `page.tsx` and route-group `layout.tsx` files as thin adapters that import and default-export components through FSD public APIs; the root layout may additionally own Next.js metadata, fonts, global styles, and the document shell.
- Use Server Components by default. Add `"use client"` only at the smallest boundary that needs interaction, browser APIs, or client-side state.
- Keep application bootstrap, routing, route-group layouts, and styles under the canonical FSD `src/app` layer. Keep page composition in separate slices under `src/pages`. The root `app` directory remains the only Next.js App Router. Keep the tracked root `pages/.gitkeep`: the installed Next.js resolver otherwise combines root `app` with FSD `src/pages` and rejects their different parents before it can ignore the latter.
- Keep each `pages` slice responsible for one route's screen-level layout and composition. Move reusable product behavior into the appropriate lower FSD layer and import it through its public API.
- Introduce only the FSD layers required by implemented behavior; do not create empty placeholder layers.
- Preserve the `@/*` alias for imports from `src` and avoid deep relative imports across future slice boundaries.
- Keep accessibility in the component contract: prefer semantic elements, accessible names, and keyboard-compatible interactions.
- Keep the global stylesheet entrypoint in `src/app/styles/globals.css`; split palette/theme, stable application spacing/container tokens, and typography into their existing focused files under that directory. The root layout only imports the entrypoint.
- Reserve semantic spacing/container tokens for repeated application roles such as page padding and shell/auth widths. Use Tailwind's default scale for local surface padding, gaps, field spacing, responsive content widths, and generated shadcn components; do not promote one-screen geometry into the global theme.
- Use semantic font-size and line-height tokens from `src/app/styles/typography.css` inside the shared `Heading` and `Text` primitives. Keep local labels, definition lists, navigation, inline links, and generated shadcn components on Tailwind's default type scale until a repeated role belongs in a shared primitive; do not change the root `html` or `body` font size to scale the application.

Tailwind CSS and shadcn/ui provide the styling and shared UI foundation. Import project wrappers through `src/shared/ui` instead of importing generated shadcn primitives directly from route or product code. TanStack Query is the server-state boundary and generated API hooks live under `src/shared/api/generated`; update generated files through the root `pnpm api:generate` command. React Hook Form and Zod own client form validation; Zustand remains absent until an approved change requires global client state.

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

Do not edit generated `next-env.d.ts`. Git ignores it, while `next dev`, `next build`, and the `pretypecheck` lifecycle regenerate it locally; keep the file in `tsconfig.json` includes. Keep `agentRules: false` in `next.config.ts` so Next.js does not overwrite the manually maintained agent instructions.
