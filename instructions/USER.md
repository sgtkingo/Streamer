# StreamerAI users and onboarding

## First run

On first launch, the application guides the household administrator through a
short setup instead of requiring manual configuration files.

1. Create the local household and first profile.
2. Choose language and optional film/series preferences.
3. Connect the metadata source through a guided TMDB token flow with an
   automatic connection test.
4. Connect the streaming provider, initially Webshare, with an automatic login
   and playback-capability test.
5. Detect the local AI runtime and run the minimum-hardware/model preflight, or
   continue without AI until it is configured.
6. Detect embedded subtitle support and optionally connect a future external
   subtitle source, ČSFD enrichment, web search, and later cloud sync.

Google and Apple sign-in remain future options for a hosted identity flow. The
home self-hosted MVP uses a local administrator account and up to five profiles.

## Primary user journey

The main action is a large natural-language search at the top center of the
application. The user can write, for example:

- `I feel like an autumn movie with Sandra Bullock.`
- `A clever 90-minute sci-fi film, not too dark.`
- `A Czech crime series with complete seasons available.`
- `Something similar to Arrival, but suitable for the whole family.`

StreamerAI shows progressive status while it understands the request, validates
titles and checks streaming availability. The final answer contains only
database-validated titles and clearly separates playable and unavailable items.

The result remains a conversation. A user can continue with instructions such
as `more humorous`, `only after 2015`, `German dubbing`, `why this one?`,
or `show me another lead recommendation`. Follow-ups update a structured
discovery intent and reuse already validated results when possible.

The Home screen is not empty before a search. It offers Continue Watching, New
Releases, Trending, Top Rated and Picks for You. Header links scroll to these
sections. Each section may refresh progressively while cached validated content
remains visible.

## Library and watch history

Library is the user's durable personal collection:

- starting playback automatically adds the title;
- **Add to Library** saves a title without starting it;
- movies and series can be filtered by saved, in progress and completed state;
- a series entry tracks progress and next verified playable episode;
- removing a title from Library does not silently delete its history; that is a
  separate explicit privacy action.

Watch History is a chronological secondary view available from the Library side
panel and profile menu. It records playback sessions, episode identity,
positions and completion. The user can remove individual entries, clear a
profile's history after confirmation, or disable history-based learning.

On a discovery or Home tile:

- **Play** is shown only for a currently verified compatible stream;
- **Add to Library** is available for every metadata-validated title, including
  titles that are not currently streamable;
- after saving, the action becomes a clear `In Library` state with an explicit
  remove action in the overflow menu.

## Profiles and learning

Preferences are optional. The application can gradually learn from:

- watched and completed titles;
- explicit likes, dislikes and `not now` feedback;
- accepted or rejected recommendations;
- preferred audio/subtitle languages and quality;
- recurring moods, people, genres, eras and viewing contexts.

History never overrides the current message. A user asking for a different mood
must not be trapped by an established profile.

## Trust and control

- Every rating displays its source.
- Every title displays whether streaming availability was checked and when.
- Series display exact season/episode coverage rather than an unsupported
  `complete` claim.
- The user can correct a match, choose another streaming variant, refresh an
  availability check, remove a conversation, or delete learned preferences.
- A remote model or web-search provider is never used silently.
- Provider credentials stay on the home node and are never included in model
  prompts, browser storage, logs, or cloud sync.
- The UI explains that sensitive local credentials are encrypted and identifies
  which optional features send minimized data outside the home node.

The application remains usable for direct library browsing and playback when
the agent, web search, metadata provider, or cloud synchronization is offline.
