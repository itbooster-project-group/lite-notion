## 1. API contract for current asset references

- [x] 1.1 Add nullable `avatarAssetId` and `coverAssetId` to the existing profile/page DTO mapping and selects; add API tests for selected and empty references without adding database fields or migrations.
- [x] 1.2 Regenerate/verify OpenAPI and the web generated client, expose the existing asset operations through the public `shared/api` entry point, and update MSW handlers for all used operations.

## 2. Shared asset transport and presentation

- [x] 2.1 Add a narrow authenticated raw-image upload transport with progress; use the existing auth-session refresh and retry the original request at most once after 401, terminate on refresh/retry failure, and never retry 403 or duplicate the refresh implementation.
- [x] 2.2 Add a small authorized metadata/read URL resolver using existing API and TanStack Query; key cached data by asset ID and authorization context, expire URLs with a safety margin, and clear authorization-sensitive data on logout/session expiry/user change.
- [x] 2.3 Add a pure SSR-compatible image presentation receiving resolved `src`, `alt`, state, and fallback; it must perform no requests and preserve existing external-image rendering.
- [x] 2.4 Add unit and RTL tests for local progress, successful ready response, same assetId/Blob on one 401 refresh retry and explicit retry, failed refresh/repeated 401 termination, 403 without retry, 409 not treated as success, ambiguous network result, no automatic second initiation, single-flight refresh, query invalidation, one bounded image-error refresh, and fallback accessibility.

## 3. Profile avatar and participant presence

- [x] 3.1 Add own-profile avatar upload, replace, remove, current-avatar display, and fallback using the existing profile/API conventions.
- [x] 3.2 Extend collaborative participant presentation with current avatar identity and update Awareness on avatar change without a Y.Doc transaction.
- [x] 3.3 Add RTL tests for avatar set/replace/remove and failed replacement, participant avatar update, unavailable avatar fallback, and absence of mutation controls for other users.

## 4. Page cover

- [x] 4.1 Add workspace cover presentation and owner/editor upload, replace, and remove actions using page-context API operations.
- [x] 4.2 Handle viewer mode, permission loss, failed replacement, unavailable asset, and rollback of optimistic state without deleting detached assets.
- [x] 4.3 Add RTL tests for cover lifecycle, read-only viewer, permission denial, reload restoration, and safe fallback.

## 5. Asset-backed TipTap image nodes

- [x] 5.1 Extend the existing schema v2 normalization and editor image flow to accept backend-compatible asset source identity while preserving legacy external images.
- [x] 5.2 For a new page upload pass `pageId` at initiation and rely on its existing grant; for an already ready asset on another page use the existing grant endpoint only when needed. Confirm upload/ready/grant before insertion.
- [x] 5.3 Collect alt/decorative choice in the minimal upload form: require non-empty trimmed alt by default; only an explicit decorative choice sets empty alt. Insert exactly one node with one stable `nodeId`, stable `assetId`, compatible `source`, `alt`, and `decorative`; never write signed URLs into Y.Doc.
- [x] 5.4 Add an editor-specific NodeView that uses the authorized URL resolver and delegates display to the pure presentation; signed URL refresh must stay outside Y.Doc transactions.
- [x] 5.5 Update static/SSR rendering with the existing `@tiptap/static-renderer` path for asset-backed nodes; avoid the interactive editor/NodeView runtime, Yjs, Hocuspocus, and authorized client resolver, without writing a custom renderer.
- [x] 5.6 Add unit/RTL tests for ready-before-insert, grant success/denial without duplicate grant, permission/error paths, repeated activation, stable IDs, both valid and both invalid alt/decorative combinations, independent URL refresh, unavailable assets, editor deletion of unavailable image, and legacy external image compatibility.

## 6. Collaboration and recovery verification

- [x] 6.1 Add the projection-lag scenario to the existing PostgreSQL integration suite and use the existing scheduler/use case directly: viewer read fails closed before convergence, projection catches up, and a subsequent authorized read succeeds; do not wait for a real scheduler interval or create a parallel harness.
- [ ] 6.2 Extend the existing opt-in collaboration E2E with two-user upload/insert/sync, viewer controls, remove sync, reload, and reconnect; verify no duplicate node and no signed URL in document content, and verify the node can be removed while unreadable when page edit permission remains.
- [ ] 6.3 Verify access-token expiry/refresh during upload and asset URL reads, plus actual page permission loss during attachment, cover mutation, and document edit.
- [ ] 6.4 Run configured local checks for affected web/API scope: Vitest/RTL, PostgreSQL integration tests, collaboration E2E where its required environment is available, lint, typecheck, build, OpenAPI/generated-client consistency, and strict OpenSpec validation; record unavailable external S3 smoke checks as unrun.
