## ADDED Requirements

### Requirement: Uploaded images become stable asset-backed document nodes

The collaborative editor MUST upload and confirm an image asset is ready before inserting its image node into the Y.Doc. Each inserted node MUST contain a stable `nodeId`, stable `source: { type: 'asset', assetId }`, and schema-v2-compatible `alt` and `decorative` attributes; it MUST NOT contain a signed URL. A non-decorative image MUST have non-empty trimmed `alt`; a decorative image MUST have empty `alt`. The operation MUST respect the page's effective edit permission, prevent duplicate insertion from repeated activation, and preserve existing external image nodes and schema compatibility.

#### Scenario: Editor inserts an uploaded image
- **WHEN** an editor uploads a supported image and the API confirms it ready
- **THEN** the editor inserts one image node with stable `nodeId` and `assetId` using the existing asset source contract
- **AND** the node includes a compatible `alt`/`decorative` pair
- **AND** the document projection can derive the page asset reference

#### Scenario: User describes a non-decorative image
- **WHEN** the user leaves decorative mode off and submits an image with non-empty alt text
- **THEN** the inserted node has `decorative=false` and the trimmed non-empty `alt`

#### Scenario: User explicitly marks an image decorative
- **WHEN** the user explicitly selects decorative mode
- **THEN** the inserted node has `decorative=true` and empty `alt`
- **AND** decorative mode is never selected implicitly to bypass validation

#### Scenario: User submits an invalid accessibility attribute pair
- **WHEN** a non-decorative image has empty alt or a decorative image has non-empty alt
- **THEN** insertion is rejected and no image node is written to Y.Doc

#### Scenario: Upload fails before insertion
- **WHEN** upload or ready confirmation fails
- **THEN** no asset-backed image node is written to Y.Doc
- **AND** the editor offers a safe retry or file reselection state

#### Scenario: User activates insertion twice
- **WHEN** a user double-clicks or repeats the insert action while one upload is active
- **THEN** the UI does not create duplicate uploads or image nodes for that action

#### Scenario: Two collaborators observe a new image
- **WHEN** one editor inserts a ready asset-backed image into the shared document
- **THEN** another connected collaborator observes the same stable node and asset identity through Yjs synchronization

#### Scenario: Existing external image is loaded
- **WHEN** a document contains a legacy external image node
- **THEN** the editor continues to render and preserve it without rewriting it as an asset-backed node

#### Scenario: New page upload receives its grant during initiation
- **WHEN** a new image upload is initiated with the target `pageId`
- **THEN** the client waits for the existing upload and ready confirmation and uses the grant created by backend initiation
- **AND** it does not call the grant endpoint again for that page

#### Scenario: Existing ready asset is attached to another page
- **WHEN** the uploader reuses an existing ready asset in a different target page
- **THEN** the client calls the existing page grant operation and waits for success before inserting the node
- **AND** it does not maintain a parallel client-side grant registry
- **AND** a denied grant leaves Y.Doc unchanged

#### Scenario: Another editor reuses an asset with an existing grant
- **WHEN** a different page editor inserts an asset already granted to the target page
- **THEN** the editor uses the existing grant and does not attempt to create a grant as another user's uploader

#### Scenario: Another editor has no grant for the asset
- **WHEN** a different page editor tries to reuse an asset without a target-page grant
- **THEN** insertion is rejected and Y.Doc remains unchanged

### Requirement: Asset image presentation survives reload and reconnect

An asset-backed image MUST be rehydrated from its stable asset identity after reload or collaboration reconnect. Refreshing a signed URL or rendering an unavailable state MUST NOT create a Y.Doc transaction. An unavailable read MUST NOT change the page's editability or mutate/remove the node. A user with current page edit permission MUST retain ordinary document operations on that node, including deletion; when page edit permission is actually lost, content mutations MUST stop according to backend authorization.

#### Scenario: Document reloads with an asset image
- **WHEN** a page reload restores an asset-backed image from Y.Doc
- **THEN** the editor resolves a fresh read URL for the current page context and renders the image
- **AND** it does not persist that URL into Y.Doc

#### Scenario: Collaboration reconnects
- **WHEN** the editor reconnects and resynchronizes an image node
- **THEN** it reuses the synchronized node and asset identities and refreshes presentation independently
- **AND** it does not insert a duplicate node

#### Scenario: Read permission is lost
- **WHEN** backend denies the image read after page permission is revoked
- **THEN** the image uses a safe unavailable placeholder
- **AND** read failure alone does not disable the rest of the page editor or the authorized editor's ability to remove the node

#### Scenario: Asset is missing or deleted
- **WHEN** a referenced asset cannot be resolved as readable and ready
- **THEN** the editor renders an accessible placeholder without a broken-image icon
- **AND** it leaves document content unchanged until an authorized user deliberately edits it

#### Scenario: Authorized editor removes an unavailable image
- **GIVEN** the user retains effective page edit permission
- **WHEN** the user deliberately removes an image node whose asset read URL is unavailable
- **THEN** the node is removed through the ordinary Y.Doc edit flow

#### Scenario: Page edit permission is revoked
- **WHEN** the user's effective page edit permission is revoked
- **THEN** content mutation controls are disabled and backend authorization rejects further document writes
- **AND** the node is not automatically removed because of the permission change

#### Scenario: Projection has not caught up with a synchronized image
- **WHEN** a viewer resolves an image before `PAGE_ASSETS` projection reaches the current document revision
- **THEN** the image remains in Y.Doc and the viewer sees the safe unavailable fallback for the denied read
- **AND** the client does not duplicate the node or retry the indistinguishable permission-denied response automatically
- **AND** after projection converges, a subsequent authorized resolution can display the image
