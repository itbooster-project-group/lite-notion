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
- `pnpm dev`: start PostgreSQL, wait for its healthcheck, then start web and API in parallel. PostgreSQL remains running after the app processes stop; use `pnpm db:down` to stop it.
- `pnpm dev:web`: start only web without managing Docker Compose services.
- `pnpm dev:api`: start PostgreSQL, wait for its healthcheck, then start only API. PostgreSQL remains running after API stops.
- `pnpm lint`: run the non-mutating Biome check.
- `pnpm typecheck`: type-check every application.
- `pnpm test`: run all Vitest suites once.
- `pnpm build`: build every application.
- `pnpm format`: apply Biome formatting; use only when formatting changes are intended.

Before finishing a change, run the checks relevant to the edited scope. Run the complete root check set for cross-cutting, dependency, or configuration changes.

Every Pull Request into `main` must pass the required `lint`, `web`, and `api` GitHub Actions checks (`.github/workflows/ci.yml`) before it can be merged; direct pushes to `main` are rejected by repository rules.

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

Human contributors using coding agents should follow `docs/openspec-workflow.md`. Use one logical OpenSpec change per short-lived branch and Pull Request. Process, architecture, team-rule, and other significant documentation changes require an OpenSpec change; typo, broken-link, and minor wording fixes may go directly through a Pull Request.

1. Run `openspec list` and inspect the relevant change before implementation.
2. Obtain human review of the proposal, specs, design, and tasks before implementation.
3. Read every context file returned by `openspec instructions apply --change <name> --json`.
4. Follow the approved proposal and design; do not expand scope silently.
5. Work through pending tasks in order and mark each checkbox only after its implementation is verified.
6. If implementation changes a design decision, update and reconcile the planning artifacts, then obtain human review before continuing.
7. Run `openspec validate <name> --strict` and the relevant repository checks before declaring the change complete.

Do not archive a change until all tasks and checks are complete and its implementation has received human review. Archive it in the same Pull Request, review the archive and any synced main-spec changes, then merge.
