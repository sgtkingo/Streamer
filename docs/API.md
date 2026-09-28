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
  }
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

A completed response contains `bestMatch`, `available` and `unavailable`
groups. Every item is a fully validated canonical `CatalogTitle`. The best
match is always playable; unavailable and unknown records never receive a Play
action. The default coordinator returns `mode: "preview"` Home data and an
explicit preview warning in discovery.

## Library, History and playback

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/profiles/:profileId/library` | List the profile Library. |
| `PUT` | `/profiles/:profileId/library/:titleId` | Explicitly save a validated title. |
| `DELETE` | `/profiles/:profileId/library/:titleId` | Remove Library membership. |
| `GET` | `/profiles/:profileId/history` | List newest playback events. |
| `POST` | `/profiles/:profileId/playback/start` | Verify playability, add to Library and append History. |

Playback body:

```json
{
  "titleId": "sai:preview:lake-house"
}
```

`PUT` and `DELETE` have no request body. Unknown titles return
`TITLE_NOT_FOUND`; known titles without a verified playable variant return
`TITLE_NOT_PLAYABLE` from playback start.

## TMDB connection

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/integrations/tmdb/check` | Verify a read token without saving it. |
| `POST` | `/integrations/tmdb/connect` | Verify, then save through `SecretStore`. |

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

## Versioning rules

Shared request and response shapes live in `packages/contracts`. Additive
changes should remain backward compatible inside `/api/v1`. Breaking changes
require a new versioned route and a migration window for the web client.
