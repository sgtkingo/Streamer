# Architecture

StreamerAI is local-first. The browser is a presentation client; secrets,
provider traffic, validation, canonical identity and playback decisions stay
on the local server.

## Workspace

| Path | Responsibility |
| --- | --- |
| `apps/web` | React/Vite PWA, onboarding, Home, discovery results, Library and History. |
| `apps/server` | Fastify API, provider orchestration, safety boundaries and application services. |
| `packages/contracts` | Runtime Zod schemas and provider-neutral TypeScript contracts. |
| `packages/database` | SQLite migrations and repositories. |
| `instructions` | Approved product, deployment and integration specifications. |
| `docs` | Developer-facing description of the current implementation. |

## Request flow

```text
React UI
  -> Fastify route
    -> StreamerCore
      -> StreamerContentProvider (discovery coordinator)
        -> Agent/Search adapters propose candidates
        -> Metadata adapters resolve canonical identity and facts
        -> Media adapters verify availability and formats
      -> SQLite canonical cache, Library and History
    -> strict shared response schema
  -> tiles rendered from validated records only
```

`PreviewContentProvider` implements the coordinator contract for development.
A live coordinator is injected through `createApp({ contentProvider })`; it can
compose any number of provider adapters without changing routes, Library or
History.

## Discovery boundary

The model is a planner and ranker, not a fact database. A live coordinator must
perform these stages:

1. Interpret the conversational request and profile preferences.
2. Gather candidate titles from bounded model/search tools.
3. Resolve each candidate through a deterministic metadata provider.
4. Assign or reuse an internal canonical ID and save external ID mappings.
5. Check media availability, formats and series coverage.
6. Remove unvalidated candidates from agent context.
7. Rank only validated records and return the three UI groups.

Every completed discovery response is parsed against
`DiscoveryResponseSchema`. `StreamerCore` then upserts all returned records into
the canonical cache before the user can save or play them.

## Core invariants

- Internal IDs are provider-neutral. TMDB, CSFD and media IDs are mappings, not
  primary keys.
- The best match must be `available` or `partial`.
- `available` requires at least one verified media format.
- `unknown` and `unavailable` are different states.
- Movies cannot carry series coverage.
- Series completeness must match verified season and episode counts.
- Discovery groups cannot contain duplicate canonical IDs.
- Playback is rejected unless the current canonical record is playable.
- Starting playback adds or updates Library membership and appends History in
  one SQLite transaction.
- Provider credentials never enter shared media records, browser state, logs or
  sync payloads.

These rules are runtime-validated in `packages/contracts/src/media.ts`, not
only expressed as TypeScript types.

## Persistence

SQLite runs in WAL mode. The default development file is
`data/streamer-ai.db`; tests use an in-memory database. Important tables are:

- `canonical_titles` - sparse, on-demand validated title cache;
- `external_entity_mappings` - provider IDs and provenance;
- `library_entries` - per-profile saved/in-progress/completed state;
- `watch_history_events` - append-only playback history;
- profiles, settings, jobs and integration status tables from earlier
  migrations.

The canonical cache is not intended to become a full mirrored film database.
Refresh metadata and availability according to provider-specific TTLs while
preserving local Library and History state.

## Failure model

External systems are optional failure domains. Metadata, media, AI, search or
sync downtime must not prevent access to already cached local data. Adapter
errors are translated to stable public codes; raw upstream responses remain
server-side and redacted.

Production startup rejects the current in-memory secret and integration-state
stores. A durable secure-local implementation is a release gate, not a TODO to
work around with environment variables.
