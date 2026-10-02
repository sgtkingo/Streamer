# StreamerAI interface

## Global navigation

- StreamerAI logo on the left.
- `Home` and `Library` are the primary routes.
- On Home, compact links such as `Continue`, `New`, `Trending`,
  `Top Rated`, and `For You` scroll smoothly to section anchors rather than
  opening separate catalog pages.
- Profile medallion and setup/health entry on the right.
- Dark cinematic presentation derived from `DESIGN.md`.
- English is primary; Czech and German are alternative interface languages.

## Conversational discovery header

The dominant control is a wide search/composer centered near the top of the
Home screen. It is more prominent than navigation, but remains visually calm:

- dark surface, thin low-contrast border, no shadow and no decorative gradient;
- large readable input with a subtle gray rotating/example placeholder;
- example copy: `Try “an autumn movie with Sandra Bullock”`;
- submit button and keyboard submit via Enter; multiline follow-ups use
  Shift+Enter for a new line;
- optional compact controls for voice input or clearing the conversation may be
  added later, but must not distract from text entry.

After the first request, the composer becomes the input for a continuing chat.
Previous user constraints and concise agent explanations appear in a restrained
conversation column. The results remain the visual focus; this must not become a
generic full-screen chat application.

## Default Home content

The page must never look like an empty search landing page. Directly below the
composer, render these sections in order when content exists:

1. **Continue Watching** — local progress, next episode and remaining time;
2. **New Releases** — recent validated releases from canonical feeds;
3. **Trending** — current canonical/search-assisted trends;
4. **Top Rated** — validated source ratings with a minimum-vote policy;
5. **Picks for You** — profile-aware validated recommendations.

Use a stale-while-revalidate experience: cached validated tiles appear
immediately, a small freshness indicator shows background refresh, and a
provider error does not erase the previous section.

Section navigation updates the URL fragment and scrolls with the header offset.
It must preserve keyboard focus, respect reduced-motion preferences and support
direct links such as `/#trending`.

## Progressive discovery state

Do not show a blank spinner. Display the bounded pipeline as understandable
steps without revealing chain-of-thought:

1. `Understanding your request`
2. `Finding possible titles`
3. `Validating metadata`
4. `Checking your streaming source`
5. `Ranking verified matches`

Partial candidate names are not displayed before validation. Errors are scoped
to the affected provider and preserve any already validated results.

## Result layout

### Best match

- One large, colorful cinematic tile using validated artwork.
- Title, year, type, source rating, short reason for the match and a prominent
  Play action when available.
- A small `Best match` label and a freshness/availability indicator.
- Alternate formats, languages and files remain behind a three-dot menu.
- Show **Play** as the primary action and **Add to Library** as the secondary
  action. If saved, replace the latter with a non-ambiguous `In Library` state.

### Available to stream

- A responsive grid or horizontal row of smaller colorful tiles.
- Each tile shows poster, title, year, rating with source, type and a compact
  availability/format summary.
- Hover/focus reveals genres, principal cast, one-line description and the
  recommendation reason.
- Play chooses the best compatible deterministic variant; alternate verified
  variants are available under the three-dot menu.
- Every card exposes **Add to Library** without requiring playback.

### Found, not currently available

- Separate section after all playable results.
- Artwork is grayscale with reduced contrast, while text remains accessible.
- No Play affordance. Show `Not found on Webshare` and the last check time.
- Allow **Add to Library**, `Check again`, or a new conversational refinement.
- Never use color alone to communicate unavailability.

Every rating must include a compact source label such as `TMDB 74%` or
`ČSFD 81%`. A StreamerAI relevance percentage, if present, is labeled
`Match`, not `Rating`.

## Series compound tiles

A series is represented by a stacked/compound tile:

- layered poster treatment or a subtle card stack signals multiple seasons;
- summary displays verified coverage such as `5 seasons · 42/50 episodes`;
- expanding the tile reveals season rows and episode availability;
- a fully available season is colorful, a partial season mixes available and
  grayscale episode states, and a missing season is grayscale;
- `Play next` appears only when the next episode has a verified playable file;
- tile primary action is `Play` only when S01E01 is verified and starts that
  exact episode; otherwise it is `Episodes` and opens the season guide;
- format and language alternatives remain selectable per season or episode.

On mobile, the compound tile opens a full-width detail sheet. On desktop it may
expand inline or open a focused detail panel.

All title tiles open a detail view on poster, title or Details action. Films use
the same detail shell without season rows; instead they show similar films or
other saga entries only when those suggestions have been deterministically
validated. Series details group episodes by season. Episodes already verified
for playback remain actionable while a background deep search is looking for
the remaining episodes. Pending episodes have a yellow indicator and the text
`• searching...`; a failed lookup can be retried without hiding ready episodes.

## Library page

Library is a true route and contains all titles that were explicitly saved or
have started playback.

- Default view uses compact poster tiles grouped or filtered by `Saved`,
  `In progress`, and `Completed`.
- Additional filters include Movies, Series, availability, genre, year and
  profile.
- Continue/Play Next is primary for in-progress entries.
- Saved unavailable items remain grayscale and may be rechecked.
- A series card shows next episode and verified coverage.
- Empty states point back to the Home composer instead of suggesting a full
  provider catalog exists.

### Watch History

Watch History is secondary to Library and appears in a collapsible side panel on
desktop. On mobile it opens as a dedicated sheet/page. It contains a
chronological list with poster thumbnail, title/episode, timestamp, progress and
completion state.

History controls include filtering, resuming, removing one event and clearing a
profile's history. Destructive actions require confirmation and explain whether
learned preference signals are also removed.

## Responsive and accessible behavior

- Desktop keeps the centered composer and cinema-wide result canvas.
- Tablet uses two-column supporting tiles.
- Mobile uses one column; the search/composer remains near the top and results
  preserve the Best → Available → Unavailable order.
- Home section links collapse into an accessible horizontal list or menu;
  Library remains directly reachable.
- The Library history side panel becomes a dedicated full-width sheet/page.
- All hover information is also available through keyboard focus and touch.
- Tiles have visible focus states, descriptive accessible names and minimum
  touch targets.
- Grayscale unavailable tiles retain WCAG-compliant text contrast and explicit
  status text.
- Reduced-motion mode disables animated placeholder transitions and card-stack
  motion.
