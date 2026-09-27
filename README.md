# Streamer

Streamer is a local-first, self-hosted film and series library. It combines an
incremental metadata catalog, provider-backed playback, household profiles and
a bounded local AI assistant without making playback depend on the model or a
cloud service.

The repository is at the first implementation milestone. The approved product,
deployment and agent decisions live in [`instructions/`](instructions/).

## Current milestone

- TypeScript/pnpm monorepo.
- React/Vite installable web application with guided onboarding.
- Fastify local API with health and integration setup endpoints.
- SQLite persistence in WAL mode with migrations and bounded profile storage.
- TMDB connection verification designed around an in-app guided setup flow.
- Provider-neutral boundaries for Webshare, local AI and optional sync work.

The first milestone deliberately does not claim working Webshare playback,
Cloudflare synchronization or autonomous catalog matching. Those features have
mandatory integration and safety gates in
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
