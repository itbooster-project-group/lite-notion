## 1. Icon Source Migration

- [x] 1.1 Replace all Hugeicons imports and rendered icons in `apps/web` with equivalent `lucide-react` components.
- [x] 1.2 Replace textual disclosure and drag-handle pseudo-icons in page trees with Lucide components while preserving existing interaction behavior.

## 2. Configuration and Dependencies

- [x] 2.1 Switch shadcn configuration to Lucide and document the Lucide-only UI icon convention in `apps/web/AGENTS.md`.
- [x] 2.2 Remove Hugeicons packages from `apps/web/package.json` and regenerate `pnpm-lock.yaml`.

## 3. Verification

- [x] 3.1 Verify repository search finds no remaining Hugeicons usage in source/config/lock files.
- [x] 3.2 Run `openspec validate unify-icons-with-lucide --strict`, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`.
