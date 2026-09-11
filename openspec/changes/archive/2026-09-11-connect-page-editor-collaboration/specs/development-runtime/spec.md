## ADDED Requirements

### Requirement: Development and LAN environments configure collaboration transport

Development workspace MUST expose `NEXT_PUBLIC_COLLABORATION_URL` to web and MUST configure it to reach the local collaboration runtime. LAN mode MUST derive the WebSocket URL from the selected LAN host, pass matching `COLLABORATION_ALLOWED_ORIGIN` to collaboration and include the collaboration process in its lifecycle management. Generic shared collaboration transport MUST receive the page room name from domain/composition rather than constructing it from page knowledge.

#### Scenario: Ordinary local development
- **WHEN** developer runs `pnpm dev`
- **THEN** web uses configured local collaboration URL
- **AND** collaboration runtime starts on its configured local port without requiring LAN_HOST

#### Scenario: LAN development
- **WHEN** developer runs `pnpm dev:lan` with selected LAN host
- **THEN** web receives `ws://<LAN_IP>:3002` as collaboration URL
- **AND** collaboration accepts the exact web origin `http://<LAN_IP>:3000`
- **AND** runner starts and stops collaboration together with API and web

#### Scenario: CSP allows configured collaboration connection
- **WHEN** page editor route is served
- **THEN** its CSP `connect-src` allows configured API and collaboration origins
- **AND** CSP does not rely on a hardcoded localhost collaboration address
