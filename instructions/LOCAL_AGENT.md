# StreamerAI local agent architecture

> **Status:** ACTIVE DIRECTION — revised by owner for on-demand discovery on 2026-09-27
> **Target hardware:** desktop with 8 GB GPU VRAM
> **Last hardware check:** 2026-09-28

## 1. Decision

Use the owner's installed **Qwen3.5 4B, Q4_K_M quantization, through Ollama** as
the default local model. The tag is explicit so a future change to `latest`
cannot silently replace the approved model.

The current Ollama artifact is:

```text
Model:        qwen3.5:4b
Parameters:   4.7B
Quantization: Q4_K_M
Download:     3.4 GB on the target host
License:      Apache-2.0
Context:      4,096 tokens configured for this application
Concurrency:  1
Thinking:     disabled for routine structured tasks
```

The 4B artifact leaves materially more headroom on the 8 GB GPU for the KV cache, desktop compositor, and video playback than the 9.7B artifact. The initial context stays at 4096 and `/api/ps` residency remains a release gate. Qwen documents broad multilingual coverage including Czech, English, and German, and the Ollama package declares tool use. The application still verifies those abilities on its own fixtures; a model card is not an acceptance test.

The target-host acceptance run passed version, exact model, metadata,
structured-output, tool-call and residency checks. Ollama reported 3,128,038,521
bytes resident in VRAM and the complete preflight took about 4.15 seconds.

Offer the larger explicit tag only as a future Quality profile after a separate
hardware warm-up and quality evaluation:

```text
Model:        qwen3.5:9b
Parameters:   9.65B
Quantization: Q4_K_M
Download:     approximately 6.6 GB
License:      Apache-2.0
Context:      4,096 tokens on this hardware class
Concurrency:  1
```

The 9B artifact nearly fills an 8 GB GPU before runtime/context/display overhead. It may partially offload to system RAM, become slow, fail during playback, or OOM. It is not the default and should be unloaded during video transcoding or other GPU-heavy work.

If the 4B model fails preflight or quality gates, deterministic browsing,
previously validated records and playback remain usable, while open-ended
conversational discovery is clearly unavailable. The app must not silently
download a different model or send data to a remote provider.

## 2. Why this model

| Candidate | Representative local artifact | License | Language/tool fit | Decision |
|---|---:|---|---|---|
| Qwen3.5 4B Q4_K_M | 3.4 GB | Apache-2.0 | Explicit CS/EN/DE coverage; tools; strong structured-task fit | **Default** |
| Qwen3.5 9B Q4_K_M | 6.6 GB | Apache-2.0 | Better agent/tool benchmark, but little 8 GB headroom | Optional Quality profile |
| Gemma 4 E4B QAT | about 6.1 GB | Apache-2.0 | Broad multilingual and tool support, but no clear advantage here | Not selected |
| Llama 3.1 8B Q4_K_M | about 4.9 GB | Llama Community License | Czech is not one of the eight officially supported languages | Not selected |
| GLM-4 9B Q4 | about 5.5 GB | Custom GLM-4 license | Older desktop/tool path; weaker fit for this multilingual client | Not selected |
| GLM-4.6V-Flash 9B | no stable official Ollama default identified | MIT | Promising tools, but official focus and desktop packaging are less suitable today | Re-evaluate later |

Gemma and GLM remain useful evaluation challengers. A model change is allowed only when the candidate beats the approved model on the project's Czech/English/German data while meeting the same memory, latency, schema, and license gates.

## 3. Runtime choice

### MVP: Ollama

Ollama is the proposed initial runtime because it provides:

- straightforward Windows, Linux, and macOS installation;
- GPU-aware local execution and named, reproducible model tags;
- native tool calling;
- JSON/JSON-Schema structured outputs;
- native and OpenAI-compatible HTTP APIs;
- endpoints for version, installed models, model details, running-model memory, and health/preflight checks.

Ollama is a runtime, not the agent. The application owns prompts, policies, task state, tools, validation, retries, audit records, and access control.

### Later packaged runtime: llama.cpp

Use `llama.cpp` as a future bundled sidecar if the product needs a single installer and tighter control of the exact GGUF artifact. It supports CPU/GPU hybrid execution, multiple GPU backends, an HTTP server, API key, health endpoint, OpenAI-compatible calls, schemas, and tools. It requires more packaging and template regression testing than Ollama, so it is not the fastest MVP path.

### Future remote runtime

Use vLLM or SGLang on a dedicated GPU host behind an OpenAI-compatible endpoint. Do not deploy those runtimes on this 8 GB desktop. The remote service is an optional inference provider; Webshare, media gateway, credentials, and the authoritative local database stay on the home node.

## 4. Application boundary

The browser never calls Ollama. The backend exposes task-oriented application endpoints and calls an internal `AgentProvider` interface:

```ts
interface AgentProvider {
  health(): Promise<AgentHealth>;
  capabilities(): Promise<AgentCapabilities>;
  modelInfo(): Promise<ModelInfo>;
  generateStructured<T>(request: StructuredAgentRequest<T>): Promise<T>;
}
```

Initial implementations:

- `OllamaProvider` — MVP, using the local native Ollama API where it gives stronger schema controls;
- `LlamaCppProvider` — future bundled runtime;
- `OpenAICompatibleProvider` — future remote endpoint.

Configuration is provider-neutral:

```text
INFERENCE_PROVIDER=ollama
INFERENCE_BASE_URL=http://127.0.0.1:11434
INFERENCE_MODEL=qwen3.5:4b
INFERENCE_FALLBACK_MODEL=
INFERENCE_CONTEXT_TOKENS=4096
INFERENCE_MAX_OUTPUT_TOKENS=512
INFERENCE_CONCURRENCY=1
INFERENCE_TIMEOUT_MS=45000
INFERENCE_REMOTE_ALLOWED=false
```

The loopback URL applies when both the backend and Ollama run natively. A containerized backend uses either the private `ollama:11434` Compose service or the explicitly firewalled host-bridge address described in `DEPLOY.md`; it must never rely on a LAN-exposed Ollama port. Remote API keys are represented by `apiKeyRef` into the local secret store, never by a value in normal configuration or the database.

## 5. On-demand discovery responsibilities

The model is the conversational and semantic component of a larger deterministic
pipeline. Its memory is useful for proposing possibilities, but it is never a
source of record. `DISCOVERY.md` is the normative end-to-end contract.

### 5.1 Intent parsing and follow-up conversation

The model receives the current user message, the existing structured intent and
a minimized profile summary. It returns a strict, versioned intent patch for
media type, mood, atmosphere, season, people, genre, era, country, runtime,
language, series coverage, availability and negative constraints.

Application code validates and merges the patch. Explicit current instructions
override inferred history. When ambiguity materially changes the result, the
agent may ask one concise clarifying question; otherwise it should return a
useful initial result and state safe assumptions.

Conversation history is summarized into structured constraints and a short local
summary. The model does not need an unbounded raw transcript on every turn.

### 5.2 Candidate generation

For a request such as `an autumn movie with Sandra Bullock`, the model may use
its own general knowledge to propose bounded candidate hints:

```json
{
  "title": "candidate title",
  "alternateTitle": null,
  "yearHint": 1998,
  "typeHint": "movie",
  "personHints": ["Sandra Bullock"],
  "reasonCodes": ["CAST_REQUEST", "AUTUMN_ATMOSPHERE"]
}
```

The application may combine these hints with fresh local records, TMDB
popularity/trending/release feeds and sanitized snippets from an approved
`SearchProvider`. Candidates are hypotheses only. Model-provided plots,
people, ratings, seasons, or availability are discarded before validation.

The application, not the model, performs web requests. It enforces provider,
query, result, tool-call and time budgets and records provenance. Google result
page scraping remains out of scope; an authorized replaceable search adapter is
required.

### 5.3 Validation gate and eligible-set ranking

Every proposed candidate must resolve through TMDB and optional ČSFD enrichment
to an unambiguous canonical ID. Deterministic code then retrieves metadata,
ratings and series structure and searches Webshare for available variants.

Only the resulting validated fact objects are returned to the model:

```json
{
  "canonicalId": "tmdb:movie:123",
  "title": "Validated title",
  "year": 1998,
  "people": ["Validated person"],
  "genres": ["Validated genre"],
  "ratings": [{ "source": "TMDB", "percent": 74 }],
  "availability": "available",
  "formatSummary": ["1080p", "Czech subtitles"]
}
```

The agent may rank this bounded eligible set and generate concise user-facing
reasons. Its output contains only canonical IDs present in the input.
Application code rejects unknown, duplicate or cross-group IDs.

The result contract is:

- one Best match, selected from streamable candidates whenever any satisfy the
  request;
- other validated Available to stream candidates;
- validated but Unavailable candidates;
- warnings for unknown provider state or partial series coverage.

Unavailable and unknown are different. A Webshare timeout cannot become a claim
that a title is unavailable.

### 5.4 Ambiguous provider-file matching

Deterministic code first normalizes titles, year, film/series type, season and
episode, resolution, source, container/codec hints, audio/subtitle language and
file size. The model receives only a few ambiguous finalists and may return a
strict match-or-abstain decision.

Device compatibility, bitrate, preferred language, Range behavior and final
playable variant selection remain deterministic. Self-reported model confidence
is never trusted by itself. A user correction wins and becomes an evaluation
fixture.

### 5.5 Series assembly

Canonical metadata defines expected seasons and episodes. The agent may assist
only with ambiguous filename-to-episode mapping after deterministic parsing.
Completeness is calculated in application code:

- a fully matched expected episode is available;
- a season/series is complete only when all expected non-special episodes are
  available;
- multi-episode files require a deterministic covered range;
- season packs without inspectable coverage remain unverified;
- missing episodes are preserved for the grayscale/partial UI.

### 5.6 Labels, collections and explanations

Given validated metadata, the model may propose bounded labels, dynamic
collection membership and short recommendation explanations from an approved
taxonomy. It cannot create executable filters or write directly to the database.

For default Home content, Continue Watching is deterministic. New Releases,
Trending and Top Rated come from canonical/provider feeds. The model may rerank
only the validated Picks for You candidate set and produce short explanations;
it cannot manufacture Home-section entries.

### 5.7 Subtitle assistance

Embedded and external subtitle candidates are discovered through a
`SubtitleProvider`. Deterministic code matches media identity, language,
season/episode, release hints and optional approved hashes. The agent may rerank
a small ambiguous set or explain choices, but it cannot generate, translate or
retime subtitles in the MVP. `INTEGRATIONS.md` defines the provider contract.

## 6. What the agent does not do

The model must not:

- present an unvalidated candidate title to the user as a result;
- supply factual metadata, people, ratings, season structure or availability
  from its own memory;
- rank a candidate that is not part of the validated eligible set;
- claim that a series is complete or that a provider has no file without
  deterministic coverage/availability evidence;
- invent subtitle text, language, release compatibility, checksum or timing;
- choose bitrate, resolution, codec compatibility, Range behavior, or transcoding settings;
- receive or store Webshare passwords, WST, direct media links, Cloudflare tokens, or encryption keys;
- run a shell, arbitrary SQL, arbitrary filesystem operations, or arbitrary network requests;
- browse ČSFD, Rotten Tomatoes, Google, or any other website directly;
- bypass source rate limits, robots controls, anti-bot challenges, access controls, or provider copyright flags;
- make a low-confidence match authoritative;
- silently call a remote inference provider;
- mutate the canonical catalog without validation and an audit event;
- be required for browsing the library or playing an already matched title.

## 7. Tool policy

The orchestrator offers narrowly scoped tools, for example:

```text
catalog.getCandidates(normalizedTitle, year, type, season, episode)
catalog.getMetadata(titleId, allowedFields)
profile.getPreferenceSummary(profileId)
discovery.searchApprovedProvider(query, purpose, maxResults)
discovery.resolveCanonicalCandidates(candidateHints)
discovery.getValidatedEligibleSet(sessionId)
subtitles.getCandidates(mediaVariantId, language, limit)
labels.listAllowedTaxonomy()
```

Rules:

- every argument is schema-validated and authorized in application code;
- the tool loop has a low hard limit, proposed as three calls;
- network tools use a provider adapter and host allowlist, not a user/model-supplied URL;
- tool results are size-limited, provenance-tagged, and treated as untrusted;
- candidate generation and validated ranking are separate phases; the ranking
  phase accepts only canonical IDs emitted by application code;
- read and proposal tools are separated from commit operations;
- the final output is produced in a second call without tools, under a strict JSON schema;
- allow at most one repair retry for invalid structured output, then abstain;
- record task type, input hash, model digest, prompt version, tool names, result, validation outcome, and duration — but redact personal text and secrets.

These controls specifically limit prompt injection from scraped pages or malicious filenames.

## 8. Hardware preflight and onboarding

The model download starts only after informed user consent. The UI shows model name, quantization, approximate download/disk use, license, and whether inference is local or remote.

### 8.1 Resource checks

Recommended for the default profile:

- 8 GB GPU VRAM;
- 16 GB system RAM;
- at least 8 GB free disk for the model, temporary download, and rollback headroom;
- current supported GPU driver/runtime;
- no other process consuming most VRAM.

These are support targets, not a claim that every 8 GB card performs identically. The preflight uses actual free memory and a canary run.

### 8.2 Runtime checks

1. Call `GET /api/version` and reject an unsupported Ollama version.
2. Call `GET /api/tags`; require the exact approved model tag and record its digest.
3. Call `POST /api/show`; verify model family, Q4_K_M quantization, Apache-2.0 license, and required completion/tool capabilities.
4. Run a short warm-up with `think:false`, `num_ctx:4096`, `temperature:0`, a strict JSON schema, and a bounded output.
5. Run a side-effect-free tool canary such as `echo(value)` and validate both name and arguments.
6. Call `GET /api/ps`; record the loaded model's VRAM allocation, context, and CPU offload.
7. Execute a small CS/EN/DE evaluation sample and record latency, JSON validity, and memory behavior.

UI health states:

```text
READY
DEGRADED
MODEL_MISSING
INCOMPATIBLE
OOM
OFFLINE
```

Behavior:

- 9B OOM, excessive CPU offload, invalid schemas, or unacceptable latency → suggest/activate 4B only with user confirmation.
- 4B failure → disable AI and retain deterministic features.
- Do not run 9B while playback or transcoding competes for the same GPU.
- Queue background inference at concurrency 1 and allow a “pause AI while watching” setting; default it on for the Quality profile.

## 9. Local-to-remote preparation

Every agent task carries a privacy classification:

```text
PUBLIC_METADATA       # title and public metadata only
PROFILE_DERIVED       # minimized preference summary
USER_DISCOVERY_QUERY  # current user message/intent, only with remote opt-in
PRIVATE_LOCAL_ONLY    # raw history, corrections, or other sensitive context
```

Remote rules:

- default remote permission is off;
- provider setup requires an explicit endpoint, TLS validation, encrypted API key, model, budget, and data policy;
- `PRIVATE_LOCAL_ONLY` never leaves the home node;
- `PROFILE_DERIVED` requires a separate opt-in and minimization/redaction;
- `USER_DISCOVERY_QUERY` may be sent only when the user has explicitly enabled
  remote conversational inference; prior raw conversation history remains local
  unless separately disclosed in the setup policy;
- the UI clearly marks each remotely processed feature;
- there is no automatic local-to-remote failover;
- retries, rate limits, cost limits, circuit breaker, and provider deletion/retention information are mandatory;
- changing providers does not change tool authorization or output validation.

The provider abstraction must tolerate capability differences. At startup, negotiate structured output, tools, maximum context, and model identity; disable unsupported tasks rather than relying on prompt claims.

## 10. Scheduling and caching

- Interactive discovery and follow-up messages have priority over background
  labeling, refresh and enrichment.
- Use one inference request at a time on the 8 GB profile.
- Suspend or throttle background AI during playback when GPU pressure or latency crosses the configured threshold.
- Cache deterministic and model results by normalized input hash, source versions, model digest, prompt version, and schema version.
- Invalidate when canonical metadata, provider result, user correction, model, prompt, or taxonomy changes.
- Do not keep the model permanently loaded if the operator selects a low-memory mode; unload after an idle timeout.

## 11. Quality and safety gates

Before enabling automatic matching, build a versioned evaluation set from authorized, redacted examples:

- open-ended mood/context/person requests and multi-turn refinements;
- plausible but nonexistent titles that must never reach the UI;
- candidates with ambiguous remakes, localized names and person-name collisions;
- provider outages that must remain `unknown`, not `unavailable`;
- complete and deliberately incomplete season/episode inventories;
- at least 500 representative filenames;
- films, series, seasons, multi-episode files, alternative/localized titles, release groups, and intentionally ambiguous negatives;
- balanced Czech, English, and German examples;
- known Webshare-style naming noise;
- prompt-injection-like filenames and malicious scraped snippets;
- expected abstentions, not only positive matches.

Track:

- visible unvalidated-title rate, required to remain exactly zero;
- canonical resolution precision and abstention quality;
- constraint retention/replacement across follow-up turns;
- Best/Available/Unavailable grouping validity;
- false complete-series claims, required to remain exactly zero;
- exact title/episode match accuracy;
- false automatic match rate (the critical metric);
- abstention precision/recall;
- strict JSON validity;
- tool-call validity and unauthorized-tool attempts;
- p50/p95 latency, peak VRAM/RAM, CPU offload, and OOM rate;
- label consistency and recommendation diversity.

Proposed release gates:

- 100% schema-valid response after at most one repair retry;
- no unauthorized tool execution;
- false automatic matches below the product-approved threshold, proposed initially below 0.5%;
- manual-review bucket for all decisions below calibrated auto-match confidence/margin;
- 4B remains the default if it passes; 9B is justified only by a measured quality gain large enough to offset its memory and latency cost.

Do not update the model tag, quantization, prompt, or tool schema without running the same evaluation and retaining an easy rollback.

## 12. Deployment profiles

### Current desktop

- Prefer host-native Ollama for the simplest GPU support.
- If the StreamerAI backend also runs natively, bind Ollama to loopback. If the backend runs in Compose, restrict Ollama to the host/container bridge with the OS firewall as specified in `DEPLOY.md`, or run Ollama in the private Compose network. Never expose `11434` to the LAN.
- The StreamerAI backend reaches it through the local agent gateway.
- Pin the model tag and recorded digest; do not use an uncontrolled `latest` alias.
- Store model files in Ollama's managed local storage, outside application backups.

### Future single installer

- Bundle a version-pinned `llama.cpp` server and approved GGUF.
- Generate a local API secret and bind to loopback.
- Preserve the same `AgentProvider` contract and evaluation fixtures.

### Future remote GPU node

- Deploy vLLM/SGLang behind authenticated TLS.
- Put it behind the same gateway contract; do not let clients or provider adapters call it directly.
- Keep user opt-in, privacy classification, cost limit, and explicit provider health visible.

## 13. Decision record

Owner-directed and previously approved decisions:

- [x] Conversational intent parsing and candidate generation from model
  knowledge, with mandatory deterministic metadata validation before display.
- [x] Agent reranking restricted to a bounded eligible set of canonical IDs.
- [x] Series completeness and streaming availability calculated by application
  code rather than model claims.
- [x] Home feed generation remains provider/deterministic; the model only
  reranks validated personalized picks.
- [x] Subtitle discovery is adapter-based and deterministic, with model help
  limited to ambiguous candidate reranking.
- [x] Qwen3.5 4B Q4_K_M as the default local model for the 8 GB GPU.
- [x] Qwen3.5 9B Q4_K_M only as an optional, preflight-gated Quality profile.
- [x] Ollama for MVP and llama.cpp only for later installer bundling.
- [x] 4K context, thinking disabled, concurrency 1, and strict schemas for routine tasks.
- [x] Deterministic metadata, availability and stream selection; LLM for intent,
  candidate hypotheses, ambiguous matching, bounded labels and validated-set
  recommendation reranking.
- [x] No direct browser-to-model access and no secrets/arbitrary shell/network/database tools.
- [x] Explicit, privacy-classified opt-in for any future remote inference; no silent failover.
- [x] General search through a replaceable authorized provider (proposed first adapter: Brave Search), not scraped Google result pages.

## References

- [Qwen3.5 4B official model card](https://huggingface.co/Qwen/Qwen3.5-4B)
- [Qwen3.5 9B official model card](https://huggingface.co/Qwen/Qwen3.5-9B)
- [Qwen3.5 language coverage](https://qwen.ai/blog?id=qwen3.5)
- [Ollama Qwen3.5 4B artifact](https://ollama.com/library/qwen3.5:4b)
- [Ollama Qwen3.5 9B artifact](https://ollama.com/library/qwen3.5:9b)
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)
- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
- [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)
- [llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4)
- [Llama 3.1 8B model card and license](https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct)
- [GLM-4.6V-Flash model card](https://huggingface.co/zai-org/GLM-4.6V-Flash)
- [Google Custom Search JSON API status](https://developers.google.com/custom-search/v1/overview)
- [Brave Search API and current pricing](https://brave.com/search/api/)

