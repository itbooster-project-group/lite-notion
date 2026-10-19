## ADDED Requirements

### Requirement: Participant presence can display the current avatar without document writes

Collaborative participant UI MUST resolve a participant's current avatar from authenticated presence identity and the avatar read API. Avatar IDs and signed URLs MUST remain presence or presentation data, MUST NOT be written to Y.Doc, and MUST be refreshed independently from document transactions. Missing or inaccessible avatars MUST use the existing participant fallback.

#### Scenario: Participant has an avatar
- **WHEN** a participant joins with a current avatar asset ID
- **THEN** other collaborators can display that avatar through the authorized avatar read endpoint
- **AND** cursor identity and color remain stable

#### Scenario: Avatar changes during a collaborative session
- **WHEN** a participant changes their profile avatar while connected
- **THEN** their presence presentation updates without a Y.Doc transaction or document persistence write

#### Scenario: Participant avatar is unavailable
- **WHEN** the avatar read URL is denied, expired, or unavailable
- **THEN** the participant badge displays a safe initials or neutral fallback
- **AND** collaboration presence remains available

#### Scenario: Participant disconnects and reconnects
- **WHEN** the collaboration provider reconnects
- **THEN** participant avatar presentation is resolved from current identity again and does not depend on a persisted signed URL
