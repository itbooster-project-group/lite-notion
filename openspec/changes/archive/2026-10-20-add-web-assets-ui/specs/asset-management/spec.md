## ADDED Requirements

### Requirement: Profile and page responses expose selected asset identifiers

The API MUST include nullable `avatarAssetId` in authenticated profile responses and nullable `coverAssetId` in page responses. These identifiers MUST represent the currently selected avatar or cover reference, MUST NOT expose storage keys or signed URLs, and MUST be sufficient for the client to restore the selected image after reload.

#### Scenario: Profile response includes avatar selection
- **WHEN** an authenticated client requests its profile and an avatar is selected
- **THEN** the profile response includes that asset ID
- **AND** it does not include a storage key or signed URL

#### Scenario: Profile has no avatar
- **WHEN** an authenticated client requests its profile without an avatar
- **THEN** `avatarAssetId` is `null`

#### Scenario: Page response includes cover selection
- **WHEN** an authorized client requests a page with a cover
- **THEN** the page response includes that cover asset ID
- **AND** it does not include a storage key or signed URL

#### Scenario: Page has no cover
- **WHEN** an authorized client requests a page without a cover
- **THEN** `coverAssetId` is `null`
