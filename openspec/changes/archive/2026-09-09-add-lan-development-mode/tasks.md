## 1. LAN host helper

- [x] 1.1 Add `scripts/lan-host.mjs` with pure IPv4 parsing, client-usable unicast override validation, RFC1918 auto-detection and `LAN_HOST` override resolution; no dependencies.
- [x] 1.2 Add `scripts/lan-host.test.mjs` using `node --test` for private IPv4 auto detection, loopback ignored, IPv6 ignored, internal ignored, override wins, `LAN_HOST=192.168.1.42` accepted, `LAN_HOST=100.64.0.10` accepted, `LAN_HOST=0.0.0.0` rejected, `LAN_HOST=127.0.0.1` rejected, `LAN_HOST=224.0.0.1` rejected, `LAN_HOST=255.255.255.255` rejected and clear failure without a suitable auto-detected IP.
- [x] 1.3 Add root `test:dev-lan` and include it in root `pnpm test` before existing workspace test execution.

## 2. LAN dev runner

- [x] 2.1 Add `scripts/dev-lan.mjs` that resolves LAN host, runs `pnpm db:up`, prints `Web: http://<LAN_IP>:3000` and `API: http://<LAN_IP>:3001`, then starts API and web as long-running child processes.
- [x] 2.2 Start API through the existing `@lite-notion/api` `dev` script with only `PORT=3001` and `CORS_ORIGIN=http://${LAN_HOST}:3000` added to the child process env; do not add `API_BIND_HOST` or change API bootstrap/config.
- [x] 2.3 Start web through a new `@lite-notion/web` `dev:lan` script using `next dev --hostname 0.0.0.0 --port 3000`, with child process env `NEXT_PUBLIC_API_BASE_URL=http://${LAN_HOST}:3001` and `NEXT_PUBLIC_API_MOCKING=disabled`.
- [x] 2.4 Implement minimal runner lifecycle: forward `SIGINT`/`SIGTERM` to both child processes, stop the remaining child if one exits unexpectedly, exit non-zero when a child exits with an error and avoid orphan API/web processes.
- [x] 2.5 Add only stable runner tests or smoke probes that can be checked without fragile long-running process integration; do not introduce a generic process supervisor test harness.
- [x] 2.6 Allow Next.js development resources/HMR for the selected LAN host by passing `LAN_HOST` to the web child process and deriving `allowedDevOrigins` from it in `apps/web/next.config.ts`; do not hardcode the current IP or persist it in env files.

## 3. Documentation and validation

- [x] 3.1 Update README development instructions and command table with `pnpm dev:lan`, `LAN_HOST=<IP> pnpm dev:lan`, same-network requirement, `NEXT_PUBLIC_API_MOCKING=disabled` in LAN mode and possible firewall prompt note.
- [x] 3.2 Confirm existing API CORS behavior remains exact-origin with credentials and no wildcard origin; no new API runtime spec or config is required.
- [x] 3.3 Run `openspec validate add-lan-development-mode --strict`.
- [x] 3.4 Run relevant repository checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- [x] 3.5 Manual smoke-check: run `pnpm dev:lan`, open the printed Web URL from a phone/tablet on the same network, confirm the frontend loads without a Next.js `/_next/hmr` cross-origin block, perform at least one real API-backed action/request, confirm the request targets `http://<LAN_IP>:3001` rather than `localhost:3001`, and confirm CORS/credentials do not block it.
