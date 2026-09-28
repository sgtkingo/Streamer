# Integration development

Integrations are replaceable adapters. A provider name must not leak into
Library, History, UI routing or canonical identity. The normative product and
compliance rules are in [`../instructions/INTEGRATIONS.md`](../instructions/INTEGRATIONS.md).

## Extension points

Provider-neutral interfaces are exported from `@streamer-ai/contracts`:

| Contract | Supplies |
| --- | --- |
| `MetadataProvider` | Deterministic title identity, metadata, artwork and ratings. |
| `MediaProvider` | Availability recheck, formats and series coverage. |
| `SubtitleProvider` | Subtitle-source capability. |
| `SearchProvider` | Bounded web discovery capability. |
| `AgentProvider` | Conversational interpretation and ranking. |
| `SyncProvider` | Optional encrypted remote state synchronization. |

The server-level `StreamerContentProvider` composes those fine-grained
adapters into Home and discovery behavior:

```ts
export interface StreamerContentProvider {
  readonly id: string;
  readonly mode: "live" | "preview";
  bootstrapTitles(): readonly CatalogTitle[];
  buildHome(input: HomeFeedInput): HomeFeed;
  discover(
    request: DiscoveryRequest,
    completedAt: string,
    context?: DiscoveryConversationContext,
  ): Promise<DiscoveryResponse>;
  preparePlayback?(
    profileId: string,
    title: CatalogTitle,
  ): Promise<PlaybackGrant>;
}
```

Inject a live implementation at the composition root:

```ts
const app = createApp({
  contentProvider: new LiveContentCoordinator({
    agent,
    search,
    metadataProviders,
    mediaProviders,
  }),
});
```

`StreamerCore` validates coordinator output, stores every returned title in the
canonical cache, decorates profile membership, and owns Library and History.
Do not duplicate those responsibilities in an adapter.

The optional conversation context contains durable, ordered prior turns. A
provider must return the same session ID and content mode it was invoked with.
`preparePlayback` is available only on live coordinators and must perform the
provider recheck before returning a grant.

## Implemented preparation adapters

- `TmdbApiClient` owns bounded credential-safe HTTP; `TmdbMetadataProvider`
  maps search, details, ratings, feeds and series structure to shared records.
- `WebshareClient` validates XML application status even on HTTP 200;
  `WebshareMediaProvider` filters restrictions, reinspects the selected file and
  exchanges the direct URL for an in-memory same-origin playback ticket.
- Guided Webshare setup calls the documented `salt` and `login` endpoints,
  derives the legacy password digest in request-local memory, discards the
  plaintext password and stores only WST through `SecretStore`.
- `OllamaAgentProvider` supplies bounded structured generation. The separate
  onboarding preflight verifies runtime version, exact model metadata,
  structured output, tool calls and model residency before enabling it.
- `AdapterRegistry` enforces unique IDs and a single provider family at
  composition time.

These adapters are exported but are not silently activated. The default
coordinator remains preview-only until a live coordinator and verified user
connections are explicitly supplied.

## Adding a provider

1. Create a small adapter under `apps/server/src/integrations` or a dedicated
   workspace package when the implementation is substantial.
2. Give it a stable lowercase ID independent of display name.
3. Validate all upstream input. Treat HTTP success with malformed data as
   `INVALID_RESPONSE`.
4. Add timeouts, bounded concurrency, rate limiting, exponential backoff and
   cache policy appropriate to the provider.
5. Map external entities to internal canonical IDs; never use the provider ID
   as the application primary key.
6. Record provenance and timestamps for every factual claim.
7. Translate errors to stable public codes and redact upstream bodies.
8. Add the guided setup metadata and safe connection check.
9. Wire the adapter into a coordinator through dependency injection.
10. Test success, authentication failure, timeout, malformed response, rate
    limit, offline cache behavior and secret non-disclosure.

## Guided connection contract

Every credentialed integration follows the same user flow:

1. Detect a local service automatically where possible.
2. Explain what the provider supplies and which data leaves the device.
3. Link to the official credential/setup page and request only minimum scope.
4. Run a bounded, read-only verification before persisting anything.
5. Store the credential through `SecretStore`; store only sanitized status and
   an opaque reference elsewhere.
6. Clear the credential field and return only allow-listed public fields.
7. Show last check, degraded state and an explicit recheck action.
8. On disconnect, remove the secret and private provider cache without
   deleting unrelated Library or History data.

Environment variables may support tests and developer overrides. They are not
the normal household setup experience.

## Metadata providers

The first planned live metadata adapter is TMDB. CSFD and Rotten Tomatoes are
optional enrichers with separate provenance and stricter scraping gates. A
metadata adapter must resolve ambiguous titles deterministically using stable
IDs, year, media kind and aliases. Never let the agent invent a provider ID or
rating.

Ratings retain their source and scale. Do not silently merge unlike rating
systems into one unexplained score.

## Media providers

A media adapter performs an availability check for a canonical title and
returns normalized formats. It must distinguish:

- `available` - at least one currently verified playable variant;
- `partial` - some verified series episodes/seasons are missing;
- `unavailable` - the provider answered and no playable variant exists;
- `unknown` - the check could not establish current availability.

Direct media URLs are short-lived server concerns. Do not persist them in
canonical records, expose provider credentials to the browser, or treat search
results as playable before a final recheck.

The ticket store is deliberately memory-only and holds at most one active
playback grant. A redirect uses `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`; issuing another grant revokes the prior one.

## Agent and search providers

The agent receives the user request, profile preferences and validated
candidate facts. Tool output is untrusted input. Search content cannot override
system policy, request credentials or call arbitrary URLs.

The coordinator must remove candidates that fail metadata resolution before
ranking. It must also recheck media availability before returning the Play
action. The final response is parsed with `DiscoveryResponseSchema`.

## Subtitle and sync providers

Subtitle sources are independent adapters selected after the exact media
variant is known. Normalize language, release matching, hearing-impaired flags
and provenance. A subtitle failure must not corrupt playback state.

Sync is optional. The local SQLite database remains authoritative for offline
use. Sync only allow-listed user state, encrypt sensitive payloads before they
leave the home node, and resolve events idempotently. Provider credentials and
ephemeral playback URLs never enter sync data.

## Review checklist

- The adapter can be replaced without editing feature routes or UI components.
- Every claim has source provenance and a freshness timestamp.
- Offline/degraded behavior leaves cached local features usable.
- Logs and public responses are proven not to contain sentinel secrets.
- Tests cover retries without duplicate work or state.
- Setup is usable from the application without manual file editing.
- English, Czech and German user copy is ready before general release.
