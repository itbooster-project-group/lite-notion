## ADDED Requirements

### Requirement: Page cover presentation and editing follow effective page permissions

The workspace MUST display a page's selected cover using its stable asset ID and a fresh authorized page-context read URL. Users with effective owner or editor capability MUST be able to upload, replace, and remove a cover; viewers MUST see the presentation without mutation controls. A failed replacement MUST preserve the previously selected cover, and loss of permission MUST stop the mutation.

#### Scenario: Page with a cover is opened
- **WHEN** workspace page data includes a cover asset ID
- **THEN** the cover is rendered with a refreshed page-context read URL after reload

#### Scenario: Editor sets or replaces a cover
- **WHEN** an owner or editor uploads an image and the cover assignment succeeds
- **THEN** the workspace displays the new cover
- **AND** a failed upload or assignment leaves the previous cover selected

#### Scenario: Editor removes a cover
- **WHEN** an owner or editor clears the cover
- **THEN** the page displays its no-cover presentation
- **AND** the detached asset is not automatically deleted

#### Scenario: Viewer opens a page with a cover
- **WHEN** a viewer opens a page that has a live cover reference
- **THEN** the viewer can see the cover but receives no upload, replace, or remove controls

#### Scenario: Permission is revoked while editing a cover
- **WHEN** a cover mutation is denied after the page permission changes
- **THEN** the UI stops the mutation and refreshes the page state without claiming success

#### Scenario: Cover asset is unavailable
- **WHEN** the selected cover is pending, deleted, or cannot be read
- **THEN** the workspace shows a safe cover fallback without a broken image
