## Purpose

Позволяет пользователю управлять собственным аватаром и согласованно показывать его в профиле и списке участников совместной страницы.

## ADDED Requirements

### Requirement: User can set, replace, and remove own avatar

The authenticated user MUST be able to upload a supported image as their own avatar, replace the selected avatar, and remove it. The client MUST attach only an asset confirmed ready by the API, preserve the current avatar when a replacement upload fails, and use backend authorization as the final boundary.

#### Scenario: User sets an avatar
- **WHEN** a user uploads a supported image and the API confirms it ready
- **THEN** the client selects it as the user's avatar and shows the new image

#### Scenario: User replaces an avatar
- **WHEN** a replacement upload or avatar assignment fails
- **THEN** the previously selected avatar remains displayed

#### Scenario: User removes an avatar
- **WHEN** the user confirms removal
- **THEN** the current avatar reference is cleared and the profile displays the fallback
- **AND** the previous asset is not automatically deleted if it may have other references

#### Scenario: User attempts to change another user's avatar
- **WHEN** a client attempts to assign an avatar for a different user
- **THEN** the API rejects the operation and the client does not present it as successful

### Requirement: Profile avatar has an accessible fallback

The profile MUST display the selected avatar when it can be read and a stable accessible fallback when there is no avatar or the asset is unavailable. A stale or expired signed URL MUST NOT permanently replace the stable avatar asset identity.

#### Scenario: Profile has no avatar
- **WHEN** the profile has `avatarAssetId = null`
- **THEN** the UI shows the existing initials or neutral avatar fallback

#### Scenario: Profile avatar cannot be loaded
- **WHEN** the selected avatar is deleted, inaccessible, or its signed URL cannot be refreshed
- **THEN** the UI shows an accessible fallback without a broken image
