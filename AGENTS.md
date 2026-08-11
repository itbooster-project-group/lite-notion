# Repository Guidelines

## Scope and precedence

This file applies to the entire repository. Before changing files, read this file and the nearest nested `AGENTS.md`; nested instructions add scope-specific rules and take precedence for their subtree.

`AGENTS.md` files are guidance for compatible coding agents only. They do not replace the human-facing README, execute as part of the application, or change the workflow for contributors who do not use agents.

## Project layout

- `apps/web`: Next.js frontend. Follow `apps/web/AGENTS.md` for frontend work.
- `apps/api`: NestJS backend. Follow `apps/api/AGENTS.md` for backend work.
- `openspec`: project context, change proposals, designs, and implementation tasks.
- `pnpm-workspace.yaml`: workspace membership and the shared dependency catalog.
- `tsconfig.base.json` and `biome.json`: repository-wide TypeScript and code-quality baselines.

Do not create shared packages until at least two applications have concrete code to share. Keep product functionality, infrastructure, and tooling changes within their approved OpenSpec scope.

## Toolchain and commands

Use Node.js 22 and pnpm 11.21.0. Run commands from the repository root unless a scoped instruction says otherwise.

- `pnpm install --frozen-lockfile`: verify a clean, reproducible install.
- `pnpm dev`: start web and API in parallel.
- `pnpm lint`: run the non-mutating Biome check.
- `pnpm typecheck`: type-check every application.
- `pnpm test`: run all Vitest suites once.
- `pnpm build`: build every application.
- `pnpm format`: apply Biome formatting; use only when formatting changes are intended.

Before finishing a change, run the checks relevant to the edited scope. Run the complete root check set for cross-cutting, dependency, or configuration changes.

## Dependency policy

- Every application must explicitly declare the packages it imports or invokes. Do not rely on root hoisting.
- Put a dependency version in the pnpm catalog when the same direct dependency is used by multiple workspace packages; reference it with `catalog:` in each consumer.
- Keep root-only tools, such as Biome, in the root manifest.
- Keep framework-specific dependencies in their owning application.
- Do not add a dependency unless the approved design requires it. Update `pnpm-lock.yaml` with pnpm whenever manifests or the catalog change.

## Engineering conventions

- Use strict TypeScript and preserve the shared compiler guarantees. Do not bypass errors with `any`, broad type assertions, or disabled checks unless the design explicitly justifies it.
- Follow Biome formatting and lint rules. Do not hand-format against the configured style.
- Keep controllers and route handlers free of business logic; place behavior in the appropriate application layer.
- Prefer existing abstractions and the smallest scoped change over introducing parallel patterns.
- Add or update tests for observable behavior and regressions. Keep tests deterministic and independent of external services unless the change explicitly introduces them.
- Do not commit generated output such as `.next`, `dist`, coverage, or TypeScript build info.

Use English for source-code identifiers, package names, routes, and scripts. Keep the README and OpenSpec planning artifacts in Russian unless a task explicitly requests another language. Maintain `AGENTS.md` files in English.

## OpenSpec workflow

OpenSpec is the source of truth for planned changes.

1. Run `openspec list` and inspect the relevant change before implementation.
2. Read every context file returned by `openspec instructions apply --change <name> --json`.
3. Follow the approved proposal and design; do not expand scope silently.
4. Work through pending tasks in order and mark each checkbox only after its implementation is verified.
5. If implementation changes a design decision, update and reconcile the planning artifacts before continuing.
6. Run `openspec validate <name> --strict` and the relevant repository checks before declaring the change complete.

Do not archive a change until all tasks are complete and its implementation has been reviewed.
