# StreamerAI developer documentation

This directory describes the implementation in this repository. Product rules
and approved future decisions remain authoritative in [`../instructions`](../instructions/).

## Start here

- [`DEVELOPMENT.md`](DEVELOPMENT.md) - install, run, test and debug the workspace.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) - boundaries, data flow and invariants.
- [`API.md`](API.md) - currently implemented HTTP endpoints.
- [`INTEGRATIONS.md`](INTEGRATIONS.md) - how to add metadata, media, subtitle,
  search, agent and sync providers.
- [`VALIDATION.md`](VALIDATION.md) - second-sight findings, verified invariants
  and external release gates.

## Current milestone

The repository contains a working local vertical slice:

- conversational Home with populated default sections;
- validated-result layout with a best match, playable results and visibly
  unavailable results;
- Library, editable Watch History and playback membership only after a live
  just-in-time media recheck;
- SQLite canonical-title cache and provider ID mappings;
- guided TMDB credential verification with sanitized public responses;
- durable conversational sessions and idempotent replay;
- full local Ollama capability preflight and a structured-agent adapter;
- provider-neutral contracts, family registries, TMDB normalization and a
  Webshare media/ticket adapter.

The default content coordinator is `PreviewContentProvider`. Its records,
ratings and availability are explicitly marked as preview facts and it cannot
start playback. The TMDB, Webshare and Ollama adapter boundaries are ready for
composition, but a live autonomous coordinator, Webshare guided authentication
and real-account playback spike are not yet claimed as complete. Subtitle
retrieval, web search and Cloudflare sync remain specified future adapters.

## Specification map

| Topic | Normative specification |
| --- | --- |
| Product behavior and limits | [`../instructions/CONCEPT.md`](../instructions/CONCEPT.md) |
| Conversational discovery pipeline | [`../instructions/DISCOVERY.md`](../instructions/DISCOVERY.md) |
| UI and interaction behavior | [`../instructions/UI.md`](../instructions/UI.md), [`../instructions/DESIGN.md`](../instructions/DESIGN.md) |
| Provider rules | [`../instructions/INTEGRATIONS.md`](../instructions/INTEGRATIONS.md) |
| Local model choice and runtime | [`../instructions/LOCAL_AGENT.md`](../instructions/LOCAL_AGENT.md) |
| Deployment and staged gates | [`../instructions/DEPLOY.md`](../instructions/DEPLOY.md) |

When implementation and specification differ, do not silently change the
product rule. Record the mismatch, add a test for the intended behavior, and
update both documents only after the decision is approved.
