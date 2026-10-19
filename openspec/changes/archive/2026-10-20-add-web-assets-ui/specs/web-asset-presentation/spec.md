## Purpose

Даёт web-функциям единый безопасный способ загружать и показывать private assets, восстанавливать состояние после навигации и обновлять временные ссылки без сохранения их в документе.

## ADDED Requirements

### Requirement: Asset upload exposes local progress and confirms ready only from the content response

The web client MUST use the existing authenticated asset API for upload and expose progress only as local operation state. A successful content upload response MUST be treated as confirmation that the asset is ready. The client MUST NOT claim to know pending, failed, or deleted status from endpoints that do not expose it in the caller's context. It MUST NOT persist signed URLs as identity or treat local progress as durable server state.

#### Scenario: Upload succeeds
- **WHEN** a user selects a supported image and the API confirms content upload
- **THEN** the UI reports ready and exposes the returned asset ID for attachment

#### Scenario: Upload is in progress
- **WHEN** image bytes are being transferred
- **THEN** the UI reports bounded progress where available and prevents duplicate initiation for the same active action

#### Scenario: Upload returns a conflict
- **WHEN** content upload returns HTTP 409
- **THEN** the UI does not treat the conflict as proof of success or start an unbounded retry loop
- **AND** it resolves the outcome only through an existing authorized ready metadata operation when that context supports it

#### Scenario: User retries a repeatable upload error
- **WHEN** the user explicitly retries a retryable content upload error while the original file remains available
- **THEN** the client reuses the same `assetId` and `Blob` and does not initiate a second asset
- **AND** a 409 ends the retry and is not treated as a success response

#### Scenario: Network result is ambiguous
- **WHEN** the content request may have reached the server but its response is lost
- **THEN** the UI reports an unresolved outcome and does not insert or attach the asset as ready
- **AND** it does not automatically initiate a second asset entity

#### Scenario: Access token expires during content upload
- **WHEN** content PUT receives an authentication expiry response before it can be accepted
- **THEN** the existing auth-session refresh is used and at most one retry sends the original request with the same Blob to the same asset content path
- **AND** no second upload initiation is made
- **AND** the operation ends if refresh fails or the retried request is rejected

#### Scenario: Upload is interrupted by reload
- **WHEN** the page reloads before the upload is attached to a profile, page, or document
- **THEN** the client does not claim the upload completed and requests file reselection to start a new upload

### Requirement: Asset presentation is separate from authorized URL resolution

The shared image presentation MUST be a pure component accepting ready `src`, `alt`, presentation state, and fallback; it MUST NOT make API requests or depend on auth-session, query cache, TipTap, Yjs, collaboration, or browser-only editor runtime. Authorized metadata/read URL resolution, cache, and refresh MUST be provided separately and pass resolved display data to the presentation. Read failures that do not provide a usable ready asset MUST result in an unavailable fallback; the client MUST NOT infer a precise failed/deleted status when the API cannot distinguish it.

#### Scenario: Pure presentation renders supplied data
- **WHEN** a caller provides an image `src`, `alt`, ready state, and fallback
- **THEN** the presentation renders those values without requesting metadata or a read URL

#### Scenario: Authorized resolver loads a referenced image
- **WHEN** a page or profile contains a stable asset ID and no fresh cached URL
- **THEN** the separate resolver uses the existing authorized API and passes its URL/state to the presentation

#### Scenario: Signed URL approaches expiry
- **WHEN** a cached URL reaches its refresh time before `expiresInSeconds`
- **THEN** the resolver refreshes it with a reasonable expiry safety margin without changing Y.Doc content

#### Scenario: Image loading fails
- **WHEN** an image load error occurs for a resolved signed URL
- **THEN** the resolver attempts at most one refresh for that failure without changing Y.Doc content
- **AND** shows unavailable fallback if the refreshed URL also fails

#### Scenario: Asset cannot be read
- **WHEN** metadata or read URL fails because the asset is not ready, absent, or not authorized in context
- **THEN** the UI does not infer which hidden status applies
- **AND** shows an accessible unavailable placeholder without a broken-image icon or raw backend error

#### Scenario: SSR or static rendering uses presentation only
- **WHEN** server/static output renders an image with already available display data or a fallback
- **THEN** it uses the pure presentation without an authorized client resolver or editor runtime

### Requirement: Asset actions follow authentication and current permissions

All upload, metadata, and read operations MUST use the existing application authentication and backend authorization. The client MUST refresh an expired access token through the existing refresh behavior and MUST treat backend denial as authoritative. It MUST hide or disable attachment controls when current page capability is read-only and MUST stop an operation after permission loss is reported.

#### Scenario: Access token expires during upload or read
- **WHEN** an asset request receives an authentication expiry response
- **THEN** the client uses the existing bounded refresh flow and retries the request at most once
- **AND** does not lose the selected file or stable asset identity solely because the token refreshed

#### Scenario: Page permission is lost
- **WHEN** the backend denies an attach, cover, metadata, or read request after permissions change
- **THEN** the client stops the denied action, refreshes or invalidates relevant page state, and presents a safe permission outcome

#### Scenario: Viewer opens asset presentation
- **WHEN** a viewer has page read permission and the image is a live page reference
- **THEN** the image can be displayed through the page-context read API
- **AND** mutation controls are absent

#### Scenario: Authorization-sensitive data is cleared
- **WHEN** the user logs out, the session expires, or the authenticated user changes
- **THEN** cached signed URLs and metadata for the previous authorization context are removed or invalidated

#### Scenario: Read access is denied
- **WHEN** an asset read request receives a permission-denied response
- **THEN** the resolver clears the cached URL and shows unavailable state without retrying that response as a transient error

#### Scenario: Authentication refresh fails or request remains unauthorized
- **WHEN** the auth-session refresh fails or the single retried request still returns 401
- **THEN** the operation ends in an unauthenticated/failed state without another refresh or request retry

#### Scenario: Request is forbidden
- **WHEN** an asset request returns HTTP 403
- **THEN** the operation ends and the request is not retried automatically
- **AND** the denial is not treated as a transient network error

#### Scenario: Read request has a confirmed transient failure
- **WHEN** URL resolution fails with a network error or server response that is classified as transient
- **THEN** the resolver performs only the configured bounded retry and stops without polling indefinitely

#### Scenario: Signed URL remains valid until its expiry
- **WHEN** access is revoked after a signed URL has already been issued
- **THEN** the client stops issuing new authorized reads after denial
- **AND** does not assume the previously issued URL can be revoked before its TTL
