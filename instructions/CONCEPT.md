# StreamerAI — product concept

StreamerAI is a local-first, conversational film and series discovery
application. It combines the ease of a streaming service with a local AI agent
that understands natural-language wishes such as:

> I feel like an autumn movie with Sandra Bullock.

The user does not need to know a title, genre name, database filter, or exact
streaming query. They describe a mood, season, actor, era, language, viewing
context, or any combination of constraints and can refine the result in a
follow-up conversation.

## Core difference

StreamerAI does **not** download or maintain a complete mirror of a film
database. Its local film database is a sparse, provenance-aware knowledge layer
that grows **on demand**:

1. The local agent converts the user's message and profile into a structured
   discovery intent.
2. It proposes candidates from its own general knowledge and, when enabled,
   from an authorized web-search provider.
3. The application validates every candidate against canonical metadata
   providers such as TMDB and optional ČSFD enrichment.
4. Deterministic code retrieves titles, years, people, seasons, episodes,
   artwork, ratings and source provenance.
5. The application searches the configured streaming provider, initially
   Webshare, and deterministically inspects available variants and format hints.
6. Only candidates that resolve to a canonical database identity may continue
   into ranking and presentation. The model never invents metadata, ratings, or
   streaming availability.
7. Validated metadata and availability checks are cached locally. Future
   queries reuse fresh records and revalidate stale availability as needed.

The detailed state machine and output contract are defined in `DISCOVERY.md`.

## Result hierarchy

Every completed discovery answer is divided into three explicit groups:

1. **Best match** — one large, colorful hero tile chosen from validated and
   currently streamable candidates whenever such a candidate exists.
2. **Available to stream** — smaller colorful tiles for other validated titles
   with at least one currently usable streaming variant.
3. **Found, but not currently available** — grayscale tiles for titles that
   exist in the metadata database but have no verified playable variant on the
   configured streaming endpoint.

Every tile shows a rating together with its source. A blended StreamerAI score
may be shown only as an additional, clearly labeled recommendation score; it
must not be presented as a source rating.

If no streamable result exists, the best editorial match may appear in the
unavailable section, but the UI must not style or describe it as playable.

## Home and personal library

The Home screen is useful before the user writes a discovery request. Below the
centered conversational composer it contains dynamic sections:

- Continue Watching;
- New Releases;
- Trending;
- Top Rated;
- Picks for You.

These sections are populated from local playback state, fresh canonical-provider
feeds and validated on-demand recommendations. They do not require or imply a
complete local catalog. Header discovery links scroll to the corresponding Home
section instead of opening separate catalog pages.

Library is a separate personal page. A title enters the Library automatically
when playback starts or explicitly when the user chooses **Add to Library**.
Library therefore contains saved, started and completed titles with filters for
movies, series, status and availability. A secondary Watch History view shows
the chronological playback event log and can be opened from the Library side
panel or profile menu.

Every validated result tile offers:

- **Play** when a compatible stream is currently available;
- **Add to Library** whether or not the title is currently streamable;
- an explicit unavailable/unknown state instead of a disabled Play action with
  no explanation.

## Series and collections

A series result is a compound tile rather than a single movie card. After the
series identity is validated, StreamerAI builds a structured hierarchy of
series → seasons → episodes and matches streaming files at episode level.

- A series may be called **complete** only when expected seasons and episodes
  have verified playable matches.
- Partial results display exact coverage, for example `3/5 seasons` or
  `26/42 episodes available`.
- Different seasons or episodes may resolve to different provider files.
- Missing episodes remain visible and grayscale; they are never silently
  omitted or inferred from a filename alone.
- The user can open the compound tile to choose a season, episode, language, or
  alternate playable variant.

## Product layers

### Conversational library layer

- natural-language discovery and follow-up chat;
- populated Home sections for continue watching, releases, trends, ratings and
  personalized picks;
- a personal Library and separate chronological Watch History;
- dynamic, profile-aware collections based on mood, season, people, era,
  language and viewing history;
- deterministic metadata, ratings and series structure from approved sources;
- a small on-demand local database with freshness and provenance;
- up to five household profiles with separate preferences and history.

### Streaming layer

- provider-neutral media search with Webshare as the first adapter;
- deterministic filename, episode, resolution, codec, language, subtitle and
  size parsing;
- explicit availability and format compatibility checks;
- one concurrent playback session in the initial scope;
- direct playback when verified, with the local Range gateway as fallback.

### Local agent layer

- understands open-ended discovery intent and maintains conversation context;
- produces candidate hypotheses, reranking and short explanations;
- can use only narrow, allowlisted search and catalog tools;
- never receives provider credentials or unrestricted network/database access;
- works only with validated canonical IDs after the candidate-discovery stage;
- may run locally by default and remotely only after explicit opt-in.

### Integration layer

Metadata databases, streaming services, subtitle sources, search engines, model
runtimes and sync backends are replaceable capability-based adapters. Core
domain objects never depend on a Webshare, TMDB or other provider-specific
response shape. The developer contract is defined in `INTEGRATIONS.md`.

## Platform and language

StreamerAI is web-based and optimized for a self-hosted home desktop. The
backend, provider adapters and default AI runtime run on the home node. English
is the primary product language, with Czech and German as supported alternatives.

The approved deployment and model constraints remain in `DEPLOY.md` and
`LOCAL_AGENT.md`; where older implementation assumptions conflict with this
document or `DISCOVERY.md`, the on-demand discovery model takes precedence.
