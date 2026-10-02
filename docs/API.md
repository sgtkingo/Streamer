# HTTP API

The current API prefix is `/api/v1`. During local development Vite proxies this
prefix to the Fastify server. JSON requests with a body must send
`Content-Type: application/json`; requests without a body should not send an
empty JSON content type.

## Health and setup

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health/live` | Process liveness. |
| `GET` | `/health/ready` | Secret and integration-state store readiness. |
| `GET` | `/setup/status` | Required onboarding steps and storage durability. |
| `POST` | `/setup/complete` | Save the default profile and preferences. |
| `GET` | `/integrations` | Sanitized public integration catalog/status. |
| `POST` | `/inference/detect` | Bounded local Ollama detection. |

`POST /setup/complete` accepts:

```json
{
  "profile": {
    "name": "Viewer",
    "locale": "cs",
    "preferences": ["mystery", "comedy"]
  },
  "localAiEnabled": true
}
```

## Home and discovery

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/home?profileId=default` | Populated Home sections for one profile. |
| `POST` | `/discovery/sessions` | Run or continue conversational discovery. |

Discovery request:

```json
{
  "profileId": "default",
  "message": "I want an autumn movie with Sandra Bullock",
  "idempotencyKey": "client-generated-stable-key",
  "sessionId": "optional-existing-session"
}
```

A completed response contains `mode`, `bestMatch`, `available`, `unavailable`
and `unverified` groups. `unknown` availability belongs only in `unverified`;
it is never silently reported as factual unavailability. Live responses also
require metadata, rating and availability provenance. The best match is always
playable. The default coordinator returns `mode: "preview"`, an explicit
warning, and no Play action.

Sessions and messages are durable SQLite records. `idempotencyKey` is scoped to
the profile: replaying the same body returns the stored response, while reusing
the key for different input returns `IDEMPOTENCY_CONFLICT`. A supplied unknown
or closed `sessionId` returns `DISCOVERY_SESSION_NOT_FOUND`.

## Library, History and playback

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/profiles` | List up to five viewer profiles with non-secret playback and taste preferences, including `onboardingComplete`. |
| `POST` | `/profiles` | Create an incomplete viewer profile from `{ "name": "Alex", "locale": "cs" }`; returns `409 PROFILE_LIMIT_REACHED` after five. |
| `PATCH` | `/profiles/:profileId` | Update display name, interface locale, genre list, taste prompt or playback preferences. |
| `GET` | `/profiles/:profileId/library` | List the profile Library. |
| `PUT` | `/profiles/:profileId/library/:titleId` | Explicitly save a validated title. |
| `DELETE` | `/profiles/:profileId/library/:titleId` | Remove Library membership. |
| `GET` | `/profiles/:profileId/history` | List newest playback events. |
| `DELETE` | `/profiles/:profileId/history/:eventId` | Remove one history event. |
| `POST` | `/profiles/:profileId/history/clear` | Clear history after an explicit confirmation token. |
| `POST` | `/profiles/:profileId/playback/check` | Verify a tile asynchronously without issuing a grant or recording History. |
| `POST` | `/profiles/:profileId/playback/prepare` | Recheck the source and issue a short lived grant without changing Library or History. |
| `POST` | `/profiles/:profileId/playback/start` | Legacy one-call prepare and start for clients that do not use the two-stage flow. |
| `GET` | `/playback/grants/:grantId/manifest` | Probe the selected media and list duration, audio tracks and extractable text subtitles. |
| `GET` | `/playback/grants/:grantId/media?audio=2&start=31.500` | Stream browser-compatible fragmented MP4 with selected audio and a start offset. First request records playback once. |
| `POST` | `/playback/grants/:grantId/progress` | Save `{ "progressPercent": 37.5 }` for Continue Watching and resume. Requires a started ticket. |
| `GET` | `/playback/grants/:grantId/thumbnail?at=30` | Generate a small JPEG preview near the requested second. |
| `GET` | `/playback/grants/:grantId/subtitles/:streamIndex` | Convert an embedded text subtitle track to WebVTT. |
| `GET` | `/playback/grants/:grantId` | Legacy direct redirect, retained for older clients. |
| `DELETE` | `/playback/grants/:grantId` | Stop/revoke the active ticket. |

Playback body:

```json
{
  "titleId": "sai:canonical:title-id"
}
```

Playback is disabled in preview mode. Live tiles call `check` automatically;
Play becomes available only after that check succeeds. `prepare` reinspects
the selected file, obtains a Webshare VIP link and requires a successful
one-byte HTTP Range response (`206`). The browser opens the in-app player and
requests the manifest, then the media endpoint. The server uses FFmpeg to
remux or transcode the chosen source; the direct Webshare URL remains only in
the in-memory ticket store and never reaches the browser. A first media
request records History and extends the active session for a film-length
window. Seeking or switching audio restarts the media response at the chosen
position. The server refreshes the private provider link for later media
requests, so an expired direct link does not break a seek. Local subtitle files
are converted to WebVTT in browser memory.
Only text-based embedded subtitles can be extracted; bitmap tracks are omitted.
Issuing a new grant revokes the previous one. Errors use stable codes such as
`PLAYBACK_GRANT_EXPIRED` and `PLAYBACK_MEDIA_UNAVAILABLE`.

Playback diagnostics are structured server logs (`docker compose logs -f --tail=200 server`):
manifest readiness/failure, stream start/finish/failure,
thumbnail and subtitle failures. They include only fixed event/failure codes,
processing phase, counts and numeric FFmpeg exit/byte values. Raw FFmpeg
stderr, provider URLs, exception messages and playback grant IDs are never
logged. The server masks grant IDs in request paths, and Nginx disables route
access/error logging for playback-grant routes. A browser-side media error remains visible
in the player but is not persisted as a client log.

History clear accepts `{ "confirmationToken": "clear-history" }`. Clearing
History never removes Library membership.

## TMDB connection

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/integrations/tmdb/check` | Verify a read token without saving it. |
| `POST` | `/integrations/tmdb/connect` | Verify, then save through `SecretStore`. |
| `DELETE` | `/integrations/tmdb` | Delete the token and disable the connection. |

Both accept `{ "token": "..." }`. Public responses are an allow-listed shape:

```json
{
  "integrationId": "tmdb",
  "ok": true,
  "status": "connected",
  "messageCode": "CONNECTED",
  "persistence": "memory"
}
```

No response contains the token, an internal secret reference, upstream body or
sensitive header. Expected failure codes include `CREDENTIAL_REQUIRED`,
`CREDENTIAL_REJECTED`, `RATE_LIMITED`, `TIMEOUT`, `INVALID_RESPONSE`,
`PROVIDER_UNAVAILABLE` and `SECURE_STORAGE_UNAVAILABLE`.

## Webshare connection

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/integrations/webshare/connect` | Exchange local username/password for WST, then store only WST through `SecretStore`. |
| `DELETE` | `/integrations/webshare` | Delete WST and disable the connection. |

Connect accepts `{ "username": "...", "password": "..." }`. The password is
used only during the request to calculate Webshare's documented legacy
`SHA1(MD5_CRYPT(password))` value; it is not persisted. Responses use the same
allow-listed connection result as TMDB and never contain the password, digest,
salt, WST or account identifier.

## Integration preparation boundaries

- `POST /inference/detect` runs the bounded Ollama version, installed-model,
  metadata, structured-output, tool-call and residency checks. It does not
  expose an arbitrary inference proxy.
- Production composes Ollama, TMDB and Webshare into the live discovery
  coordinator. The model proposes bounded candidates; TMDB verifies canonical
  facts and explicitly named people, then Webshare verifies playable files and
  formats before a title reaches the response.
- The Webshare transport, guided `salt`/`login` exchange, normalized
  `MediaProvider` adapter and FFmpeg media gateway are implemented. A real-account
  browser playback and seek trial remains a release gate; no endpoint accepts a
  caller-supplied WST or returns it to the browser.

## Versioning rules

Shared request and response shapes live in `packages/contracts`. Additive
changes should remain backward compatible inside `/api/v1`. Breaking changes
require a new versioned route and a migration window for the web client.
