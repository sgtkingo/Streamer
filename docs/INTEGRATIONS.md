# Integration experience contract

Every Streamer integration is a product feature, not a configuration-file
exercise. A user should be able to connect a provider from the application,
understand why access is needed, verify it immediately and recover from a
failure without reading server logs.

## Required setup flow

Each adapter must expose enough metadata for the setup UI to provide the same
guided sequence:

1. **Discover** — detect a local service automatically where possible and show
   whether an optional remote provider is already connected.
2. **Explain** — state what the provider supplies, which data leaves the home
   node, what is stored and whether the integration is required.
3. **Guide** — link directly to the provider's official credential/setup page
   and ask only for the minimum required values.
4. **Verify** — perform a bounded, side-effect-free connection check with a
   timeout before persisting anything.
5. **Connect** — store credentials through `SecretStore`; persist only an opaque
   secret reference and sanitized provider metadata in SQLite.
6. **Confirm** — clear credential inputs and return a status that never contains
   the credential, secret reference, raw upstream body or sensitive headers.
7. **Monitor** — expose last successful check, a human-readable degraded state
   and an explicit recheck action.
8. **Disconnect** — explain the impact, delete the secret and cached private
   provider state, and leave unrelated local library data intact.

Environment variables may provide developer/test overrides, but they are not
the normal household onboarding experience.

## Error language

Adapters translate upstream failures into stable public codes. The UI owns the
localized message and next action.

| Public code | User action |
|---|---|
| `INVALID_CREDENTIALS` | Check or replace the credential. |
| `PERMISSION_MISSING` | Open the provider settings and grant the documented scope. |
| `RATE_LIMITED` | Wait until the displayed retry time; local features continue. |
| `PROVIDER_UNAVAILABLE` | Retry later; keep the existing connection and cache. |
| `NETWORK_UNREACHABLE` | Check this device's network or local service address. |
| `INVALID_RESPONSE` | Retry, then offer a redacted diagnostic export. |
| `UNSUPPORTED_VERSION` | Update the local service or choose a supported adapter. |

Raw provider messages are diagnostic data. They are redacted and are never
treated as safe UI copy.

## TMDB first implementation

- Ask for the **API Read Access Token**, not an account password.
- Link to the official TMDB API settings and authentication documentation.
- Normalize accidental surrounding whitespace and an optional pasted `Bearer `
  prefix locally.
- Verify with an authenticated, read-only TMDB configuration request.
- Derive supported image configuration automatically after validation.
- Store the token as `tmdb.read_access_token` through `SecretStore`.
- Store only connection status, timestamps and non-sensitive configuration in
  SQLite.
- Never expose the token to profiles, the local model, logs or cloud sync.

TMDB attribution and non-commercial-use requirements remain visible in the
About/data-sources screen; successful authentication does not replace those
requirements.

## Review checklist

An integration is not complete until it has:

- adapter contract tests for success, authentication failure, timeout,
  malformed response and rate limiting;
- a setup UI test proving secrets disappear after connection;
- log and response tests proving sentinel credentials cannot escape;
- health, recheck and disconnect behavior;
- cache/rate/backoff limits and provenance for imported data;
- an offline/degraded behavior that does not block unrelated local features;
- localized English, Czech and German user-facing copy before general release.
