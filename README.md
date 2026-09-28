# StreamerAI

StreamerAI is a local-first, self-hosted film and series discovery application.
The user describes a mood, person, era or viewing context; a bounded agent
proposes candidates, while deterministic adapters validate metadata and media
availability before anything is shown as factual or playable.

The repository is at the first implementation milestone. The approved product,
deployment and agent decisions live in [`instructions/`](instructions/).

## Current milestone

- TypeScript/pnpm monorepo.
- React/Vite installable web application with conversational Home, Library,
  Watch History and guided onboarding.
- Fastify local API with Home, discovery, Library, History, health and setup
  endpoints.
- SQLite persistence in WAL mode for profiles, an on-demand canonical cache,
  provider ID mappings, Library and append-only History.
- TMDB connection verification designed around an in-app guided setup flow.
- Provider-neutral contracts for metadata, media, subtitle, search, agent and
  sync adapters.

The current development feed is explicitly labeled as preview data. It does not
claim working Webshare playback, live provider ratings, Cloudflare sync or a
finished autonomous discovery pipeline. Those features have mandatory
integration and safety gates in
[`instructions/DEPLOY.md`](instructions/DEPLOY.md).

## Prerequisites

- Node.js 22.12 or newer (Node.js 24 LTS is the deployment target).
- pnpm 10.

Install pnpm if it is not already available:

```sh
npm install --global pnpm@10.17.1
```

Then install and run the workspace:

```sh
pnpm install
pnpm dev
```

The web application is served by Vite during development and forwards `/api`
requests to the local server. Copy `.env.example` to `.env` only for non-secret
runtime overrides. Provider keys and passwords belong in the guided setup flow,
not in environment files or source control.

## Quality checks

```sh
pnpm check
```

This runs formatting validation, package-level linting, type checks, unit tests
and production builds.

## Security baseline

- The browser never talks directly to Ollama or provider APIs.
- Public integration state never contains credentials or secret references.
- A connection is tested before it is saved.
- Local use remains available when metadata, AI or sync providers are offline.
- Automated web access is implemented only behind an explicitly authorized,
  rate-limited provider adapter.

See [`instructions/DEPLOY.md`](instructions/DEPLOY.md) and
[`instructions/LOCAL_AGENT.md`](instructions/LOCAL_AGENT.md) for the complete
threat boundaries and staged delivery plan.
