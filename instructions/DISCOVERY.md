# StreamerAI on-demand discovery specification

This document is the normative contract for conversational discovery. It
separates creative candidate generation from factual validation so StreamerAI
can feel exploratory without presenting model guesses as facts.

## 1. Non-negotiable invariants

1. A model-generated title is a **candidate hypothesis**, not a catalog record.
2. A title may be shown only after a metadata provider resolves it to a
   canonical identity.
3. Metadata, people, release dates, season structure, artwork and ratings come
   from deterministic provider responses, never from model memory.
4. Streaming availability is positive only after the configured media provider
   returns at least one admissible file for the canonical title or episode.
5. A direct media link is created only when playback starts and is never stored
   in the discovery result.
6. Every external fact carries source, retrieval time and freshness.
7. The agent sees sanitized candidate facts and opaque IDs, never provider
   credentials, session tokens or direct media URLs.
8. The UI never exposes hidden reasoning or chain-of-thought. It shows bounded
   operational stages, concise recommendation reasons and source provenance.

## 2. Discovery session

Each conversation creates a local `DiscoverySession` scoped to one profile:

```text
session_id
profile_id
locale
created_at / updated_at
structured_intent
conversation_summary
active_constraints
excluded_canonical_ids
presented_canonical_ids
status
```

Raw messages and their structured summary stay local by default. A follow-up
updates the existing intent instead of starting an unrelated search. Explicit
new instructions override inferred profile preferences.

Example structured intent:

```json
{
  "mediaTypes": ["movie"],
  "moods": ["warm", "autumnal"],
  "people": [{ "name": "Sandra Bullock", "role": "cast" }],
  "genres": [],
  "releasePeriod": null,
  "runtimeMinutes": { "max": null },
  "audioLanguages": [],
  "subtitleLanguages": [],
  "seriesCoverage": "any",
  "availability": "prefer-streamable",
  "negativeConstraints": [],
  "freeTextSummary": "An autumn movie with Sandra Bullock"
}
```

The schema is strict and versioned. The model may propose an update, but
application code validates and merges it.

## 3. Pipeline and state machine

```text
USER_MESSAGE
    ↓
INTENT_PARSED
    ↓
CANDIDATES_PROPOSED
    ↓
METADATA_VALIDATED ──reject──> hidden diagnostic
    ↓
SERIES_STRUCTURE_LOADED (series only)
    ↓
AVAILABILITY_CHECKED
    ↓
ELIGIBLE_SET
    ↓
RANKED
    ↓
PRESENTED
```

### 3.1 Intent parsing

The local agent converts the current message, existing structured intent and a
minimized profile summary into a new `DiscoveryIntent`. Ambiguity may produce a
short clarifying question, but the system should prefer returning a useful
initial set when safe assumptions can be displayed.

### 3.2 Candidate generation

Candidates may come from:

- the local model's general knowledge;
- fresh records already present in the on-demand local database;
- canonical-provider discovery/trending/release feeds;
- an explicitly enabled and authorized web-search adapter.

Each proposal contains only search hints such as title, alternate title, year,
type and people. Model-supplied ratings, plot facts, seasons or availability are
discarded before validation.

Candidate generation has hard budgets for candidate count, tool calls, time and
web-search queries. Duplicate hints are normalized before provider calls.

### 3.3 Metadata validation

The metadata resolver searches TMDB first and may use ČSFD as optional
enrichment. It must:

- resolve film versus series;
- require an unambiguous canonical ID using title, year, type and people;
- abstain or ask for clarification when matches remain ambiguous;
- retrieve deterministic metadata and rating provenance;
- merge localized titles without replacing canonical identity;
- cache source payloads and normalized records with connector version and
  retrieval time.

Unresolved candidates are not presented to the user and are not passed to later
agent ranking.

### 3.4 Streaming availability and formats

For each validated canonical record, the media adapter builds deterministic
queries from canonical/original/localized titles, year and episode identity.
Webshare results are normalized into:

- film, series, season and episode identity;
- container and extension;
- resolution and source quality;
- video/audio codec hints where known;
- audio and subtitle language hints;
- size and an optional derived bitrate estimate;
- provider restrictions and current availability.

The application, not the model, filters and ranks file variants according to
device compatibility and profile language/quality preferences. The model may
only help rerank genuinely ambiguous title matches after deterministic parsing.

Availability states:

| State | Meaning | Presentation |
|---|---|---|
| `available` | At least one verified usable variant exists. | Color tile and Play action. |
| `partial` | Series has some but not all expected episodes. | Compound tile with exact coverage. |
| `unavailable` | Metadata exists but no admissible provider result was found. | Grayscale tile, no Play. |
| `unknown` | Provider check failed or is stale beyond policy. | Do not claim unavailable; show Retry. |

After the initial result appears, a series may continue a provider-neutral,
episode-by-episode deep search in the background. The system may mark an
episode playable only after matching the exact season/episode identity and
inspecting an admissible file. Search progress must not prevent playback of
earlier verified episodes. Playback preparation must never substitute a
different episode if the selected one becomes unavailable.

Availability is rechecked immediately before playback. An expired cache or
provider outage can never be converted into a factual `unavailable` state.

### 3.5 Eligible set and ranking

Only metadata-validated candidates enter ranking. Ranking uses:

1. hard intent constraints;
2. streaming tier and verified format compatibility;
3. semantic match to mood/context;
4. explicit profile preferences and feedback;
5. source rating and popularity with bounded influence;
6. novelty and diversity so one franchise/genre does not dominate.

If any streamable candidate satisfies the request, the Best match must be chosen
from that set. Otherwise no playable hero is fabricated; the UI explains that
only validated unavailable matches were found.

The model receives a bounded fact object for each candidate and returns canonical
IDs, order and short reason codes/text. The application verifies that every
returned ID belongs to the eligible set.

## 4. Result contract

```json
{
  "sessionId": "uuid",
  "intentVersion": 3,
  "bestMatch": {
    "canonicalId": "tmdb:movie:123",
    "availability": "available",
    "reason": "Warm autumn setting and requested cast member"
  },
  "available": [],
  "unavailable": [],
  "warnings": [],
  "completedAt": "ISO-8601"
}
```

`bestMatch` is nullable. It is populated only from a validated streamable
candidate. When no such candidate exists, the UI explains this and gives the
strongest metadata-only matches their normal position in `unavailable` rather
than presenting a colorful but unplayable hero.

The full tile view joins this ranking with deterministic catalog records:

- canonical/localized title and year;
- movie/series type;
- poster/backdrop attribution;
- genres, principal cast and one-line provider overview;
- one or more source ratings with source label and scale;
- optional separately labeled StreamerAI match score;
- availability state, checked time and compatible format summary;
- season/episode coverage for series;
- profile-specific Library state and playback progress.

No title may occur in more than one result group. The Best match is not repeated
in the supporting available list.

Every metadata-validated tile supports `Add to Library`. `Play` is emitted
only when availability is `available` or the selected episode of a partial
series has a verified compatible variant. Library membership is independent of
the current media provider.

## 5. Series assembly

After validating a series ID, fetch its expected season/episode structure before
matching media files.

1. Exclude specials from completeness by default but display them separately.
2. Match provider files to `season_number` and `episode_number`.
3. Support multi-episode files only when their covered range is deterministic.
4. Store alternate files per episode and select a preferred compatible variant.
5. Calculate coverage at episode and season level.
6. Label a season or series complete only when every expected non-special
   episode has a verified admissible file.
7. Revalidate the selected episode immediately before playback.

A season pack without inspectable episode mapping is a candidate container, not
proof of complete coverage.

## 6. Conversation behavior

Follow-up messages can:

- add, remove or replace constraints;
- exclude a title/person/genre;
- ask for an explanation based on validated facts;
- request another Best match without repeating prior results;
- narrow to available titles or a language/format;
- expand a series and ask about missing seasons;
- refresh stale availability.

The agent first edits the structured intent, then the pipeline evaluates which
existing candidates can be reused and which require new discovery. A chat reply
must never bypass metadata or availability validation.

## 7. Progressive events

The backend exposes task-level events suitable for Server-Sent Events:

```text
discovery.intent.updated
discovery.candidates.searching
discovery.metadata.progress
discovery.availability.progress
discovery.ranking
discovery.completed
discovery.failed
```

Events contain counts, states and safe display messages, not prompts, hidden
reasoning, raw scraped text, credentials or unvalidated candidate names.

Suggested API surface:

```text
POST /api/v1/discovery/sessions
POST /api/v1/discovery/sessions/:id/messages
GET  /api/v1/discovery/sessions/:id
GET  /api/v1/discovery/sessions/:id/events
POST /api/v1/discovery/sessions/:id/refresh
```

Mutating message requests include an idempotency key so retries cannot start
duplicate provider jobs.

## 8. Default Home feeds

Home sections reuse the same validation and provenance rules:

- **Continue Watching** is derived from local Library progress and does not need
  the agent.
- **New Releases** comes from canonical release feeds, then metadata validation
  and bounded availability checks.
- **Trending** comes from canonical trending feeds plus an optional authorized
  SearchProvider signal; web snippets cannot become title records directly.
- **Top Rated** uses source-specific ratings and a configured minimum-vote
  threshold so a tiny sample does not dominate.
- **Picks for You** starts from a minimized profile summary and local history,
  but displays only metadata-validated results.

Feed refresh is a durable background job. Cached validated content is shown
immediately and replaced only after a successful refresh. A provider failure
marks freshness as degraded rather than emptying a section.

Availability checks are prioritized for visible tiles and refreshed before
playback. Off-screen feed population must respect the same provider budgets as a
conversation and cannot scan a complete upstream catalog.

## 9. Library and History state

Library stores canonical title identity independently of metadata and media
providers. An entry records:

```text
profile_id
canonical_title_id
membership_reason = explicit | playback
state = saved | in_progress | completed
added_at / updated_at
last_played_at
next_episode_id
```

Starting playback upserts a Library entry. `Add to Library` creates a saved
entry without playback. Watch History is an append-only event stream for start,
progress, stop and completion, compacted according to retention policy.

Removing a Library entry and deleting history are different commands. History
deletion is explicit, profile-scoped and also updates any derived preference
signals selected by the user.

Suggested profile-scoped API surface:

```text
GET    /api/v1/home
GET    /api/v1/profiles/:profileId/library
PUT    /api/v1/profiles/:profileId/library/:canonicalTitleId
DELETE /api/v1/profiles/:profileId/library/:canonicalTitleId
GET    /api/v1/profiles/:profileId/history
DELETE /api/v1/profiles/:profileId/history/:eventId
POST   /api/v1/profiles/:profileId/history/clear
```

Library writes are idempotent. History clearing requires an explicit confirmation
token or equivalent same-origin confirmation flow and cannot be triggered by the
agent.

## 10. Local cache and freshness

The local database is a durable on-demand cache and user knowledge store:

- canonical identity and stable structural metadata may use a long TTL;
- ratings, popularity, releases and web trends use a shorter TTL;
- positive streaming matches are cached briefly;
- negative availability is cached more briefly than positive availability;
- provider results are always rechecked before playback;
- direct media links are never cached;
- manual corrections override automated matching and become regression fixtures.

Exact TTLs are configurable per provider. Staleness is visible in diagnostics,
and provider failure retains the last known record without silently presenting
it as current.

## 11. Failure and degradation

- No model: exact title browsing and existing validated local records remain
  usable; open-ended conversational discovery is marked unavailable.
- No web search: use model hypotheses, local records and canonical discovery
  feeds within their limits.
- Metadata provider unavailable: reuse fresh validated records; do not present
  new unvalidated candidates.
- Streaming provider unavailable: metadata matches may be shown as
  `availability unknown`, not `unavailable`.
- Partial series match: show exact coverage and missing episodes.
- Ranking failure: deterministic ordering over the validated set remains
  available.

All failures preserve the separation between known, unavailable and unknown.
