# Second-sight validation

This document records the independent review passes performed before the
current handoff. It describes code evidence, not a claim that external provider
acceptance tests have already happened.

## First pass: findings and corrections

| Finding | Correction |
| --- | --- |
| Runtime port and `.env` behavior disagreed. | Startup now loads an optional root `.env` once, validates settings and consistently defaults the API to `127.0.0.1:4400`; Vite uses the same target. |
| Setup completion was split between browser storage and server state. | SQLite settings/profile state is authoritative; the browser asks `/setup/status`. |
| Ollama detection only proved reachability. | Preflight now checks version, exact installed model metadata, Q4_K_M/license/capabilities, strict JSON output, a bounded tool canary and `/api/ps` residency. |
| `sessionId` and idempotency were declarative only. | Migration 5 adds durable sessions/messages and idempotency claims. The core now supports replay, conflict detection and ordered context. |
| Unknown availability was grouped with unavailable. | Contracts require separate `available`, `unavailable` and `unverified` groups and explicit `mode`. |
| Preview playback wrote false Library/History state. | Preview Play is disabled. A live provider must return a validated future-expiring grant before the transactional state write. |
| Direct provider URLs had no safe lifecycle. | Webshare creates an in-memory, one-active-stream ticket; only the same-origin grant path reaches application state. |
| Provider extension points were marker interfaces. | Full typed metadata, media, subtitle, search, agent and sync contracts, provenance and a family-scoped registry are exported. |
| Unknown profile reads could create profiles and exhaust the five-profile cap. | Reads now return `PROFILE_NOT_FOUND`; only explicit setup creates/updates a profile. |
| Continue Watching used fixture progress and discovered titles did not feed Home. | Progress comes only from Library state and Home receives the complete sparse local canonical cache. |
| History was read-only and Library controls were incomplete. | Single-event removal, confirmed clear, filters, loading/error states and accessible dialog behavior were added. |
| `lint` performed no linting and web type checks were indirect. | ESLint 9 with TypeScript/React Hooks rules and an explicit web `typecheck` script are part of `pnpm check`. |

## Second pass: invariants rechecked

- Provider output is parsed before persistence; live responses require field
  provenance and valid availability/series coverage.
- A claimed discovery request is completed only with its durable assistant
  message and response. Failures leave a stable failed claim instead of an
  indefinitely in-progress request.
- Replaying the same idempotency body returns the same response; a changed body
  with the same key returns `409`.
- Playback does not mutate Library or History in preview mode, for an
  unavailable title, after an expired/mismatched grant, or with an insecure
  non-loopback URL.
- Secret values are resolved only inside transports, are absent from public
  integration objects and are covered by sentinel tests.
- Webshare HTTP 200 error XML, provider restrictions and link-host allowlisting
  are rejected.
- Local AI calls are server-side, bounded and schema-oriented; no arbitrary
  Ollama proxy is exposed to the browser.
- Home remains populated in preview/offline development, while preview mode is
  visible and cannot masquerade as live provider truth.

## External release gates still open

These need authorized accounts, hardware or an infrastructure decision and are
therefore intentionally not simulated:

1. Compose a production `LiveContentCoordinator` from the prepared adapters and
   add deterministic candidate matching/ranking fixtures.
2. Exercise the implemented Webshare username/password flow with the authorized
   VIP account, then run Range, seeking, TTL, codec and restriction tests. Unit
   and API tests verify the standard md5-crypt vector, `salt`/`login` request,
   password disposal and WST-only storage; real-provider behavior remains the
   acceptance gate.
3. Run backup/restore and key-loss drills for the implemented portable
   AES-256-GCM `SecretStore`. Its Docker key is separate from the persistent
   application volume and production startup rejects the memory fallback.
4. Repeat the full Ollama canary through Docker. The host-native acceptance run
   passed all six checks on Ollama `0.34.4` with explicit `qwen3.5:4b`: 4.7B
   Q4_K_M, 4096 context tokens, tools and structured output working, and
   3,128,038,521 bytes reported resident in VRAM. The full preflight took about
   4.15 seconds. The deployment timeout remains 60 seconds for slower cold
   starts; the remaining gate is bridge connectivity and equivalent behavior
   from the server container.
5. Add the selected subtitle/search providers and optional Cloudflare sync only
   after their separate compliance and privacy gates.
6. Perform the final desktop/mobile visual browser pass. The in-app browser
   control surface was unavailable in the validation session; runtime HTTP
   smoke checks passed, but this visual gate is not represented as complete.

The full automated command for the in-repository checks is `pnpm check`.
