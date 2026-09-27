# Local agent proposal

> **Status:** DRAFT — waiting for owner approval  
> **Target hardware:** desktop with 8 GB GPU VRAM  
> **Last research check:** 2026-09-27

## 1. Decision

Use **Qwen3.5 4B, Q4_K_M quantization, through Ollama** as the default local model.

The current Ollama artifact is:

```text
Model:        qwen3.5:4b
Parameters:   4.66B
Quantization: Q4_K_M
Download:     approximately 3.4 GB
License:      Apache-2.0
Context:      4,096 tokens configured for this application
Concurrency:  1
Thinking:     disabled for routine structured tasks
```

This is the best fit for an 8 GB display GPU: it leaves materially more headroom for the KV cache, runtime, desktop compositor, and video playback than a 9–12B model. Qwen documents broad multilingual coverage including Czech, English, and German, and the Ollama package declares tool use. The application still has to verify those abilities on its own fixtures; a model card is not an acceptance test.

Offer **Qwen3.5 9B Q4_K_M** as an optional Quality profile only after a hardware warm-up and evaluation pass:

```text
Model:        qwen3.5:9b
Parameters:   9.65B
Quantization: Q4_K_M
Download:     approximately 6.6 GB
License:      Apache-2.0
Context:      4,096 tokens on this hardware class
Concurrency:  1
```

The 9B artifact nearly fills an 8 GB GPU before runtime/context/display overhead. It may partially offload to system RAM, become slow, fail during playback, or OOM. It is therefore not the default and should be unloaded while video transcoding or other GPU-heavy work runs.

If the 4B model fails preflight or quality gates, the app remains usable without AI. It must not silently download a different model or send data to a remote provider.

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

## 5. What the agent does

The model is used only where language ambiguity adds value.

### 5.1 Ambiguous title and episode matching

Deterministic code first normalizes and extracts:

- canonical/localized title aliases;
- year;
- film versus series;
- season and episode (`SxxEyy` and common variants);
- resolution and source tags;
- container/codec hints;
- audio and subtitle language hints;
- provider IDs and file size.

The model receives at most the top few candidates and returns a strict object such as:

```json
{
  "matchId": "candidate-id-or-null",
  "decision": "match | abstain",
  "confidence": 0.0,
  "reasonCodes": ["TITLE_ALIAS", "YEAR_MATCH", "EPISODE_MATCH"],
  "warnings": []
}
```

The app validates the schema and calculates the final decision from deterministic evidence, model agreement, and calibrated thresholds. Self-reported model confidence is never trusted by itself. A user correction always wins and becomes an evaluation fixture.

### 5.2 Labels and dynamic collections

Given already validated metadata, the model may propose bounded labels or collection membership from an approved taxonomy. Unknown labels require review or mapping; the model cannot create executable filters or write directly to the database.

### 5.3 Recommendation reranking and explanation

Deterministic logic produces candidates from preferences, history, language, season, availability, and diversity rules. The model may rerank a small set and generate a short explanation. It does not receive raw credentials or an unlimited viewing-history dump.

### 5.4 Trend/news synthesis

The application, not the model, calls an approved `SearchProvider` or canonical release/trend feed. It strips active content, records URLs/timestamps, and passes bounded text snippets as untrusted data. The model may summarize or label them.

Model/or app can use the https://developer.themoviedb.org/docs/popularity-and-trending as tool for finding populars/trends.

Google Custom Search is not hard-coded: its JSON API is closed to new customers and scheduled to end for existing users on 2027-01-01. A Google adapter is allowed only for an operator with valid programmatic access; scraping Google result pages is out of scope. The proposed first general-search adapter is Brave Search API, enabled only after the operator supplies a key and protected by query budgets and caching.

## 6. What the agent does not do

The model must not:

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
labels.listAllowedTaxonomy()
```

Rules:

- every argument is schema-validated and authorized in application code;
- the tool loop has a low hard limit, proposed as three calls;
- network tools use a provider adapter and host allowlist, not a user/model-supplied URL;
- tool results are size-limited, provenance-tagged, and treated as untrusted;
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
PRIVATE_LOCAL_ONLY    # raw history, corrections, or other sensitive context
```

Remote rules:

- default remote permission is off;
- provider setup requires an explicit endpoint, TLS validation, encrypted API key, model, budget, and data policy;
- `PRIVATE_LOCAL_ONLY` never leaves the home node;
- `PROFILE_DERIVED` requires a separate opt-in and minimization/redaction;
- the UI clearly marks each remotely processed feature;
- there is no automatic local-to-remote failover;
- retries, rate limits, cost limits, circuit breaker, and provider deletion/retention information are mandatory;
- changing providers does not change tool authorization or output validation.

The provider abstraction must tolerate capability differences. At startup, negotiate structured output, tools, maximum context, and model identity; disable unsupported tasks rather than relying on prompt claims.

## 10. Scheduling and caching

- Interactive matching requested by the user has priority over background labeling and discovery.
- Use one inference request at a time on the 8 GB profile.
- Suspend or throttle background AI during playback when GPU pressure or latency crosses the configured threshold.
- Cache deterministic and model results by normalized input hash, source versions, model digest, prompt version, and schema version.
- Invalidate when canonical metadata, provider result, user correction, model, prompt, or taxonomy changes.
- Do not keep the model permanently loaded if the operator selects a low-memory mode; unload after an idle timeout.

## 11. Quality and safety gates

Before enabling automatic matching, build a versioned evaluation set from authorized, redacted examples:

- at least 500 representative filenames;
- films, series, seasons, multi-episode files, alternative/localized titles, release groups, and intentionally ambiguous negatives;
- balanced Czech, English, and German examples;
- known Webshare-style naming noise;
- prompt-injection-like filenames and malicious scraped snippets;
- expected abstentions, not only positive matches.

Track:

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
- If the Streamer backend also runs natively, bind Ollama to loopback. If the backend runs in Compose, restrict Ollama to the host/container bridge with the OS firewall as specified in `DEPLOY.md`, or run Ollama in the private Compose network. Never expose `11434` to the LAN.
- The Streamer backend reaches it through the local agent gateway.
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

## 13. Approval record

Approval is requested for:

- [ ] Qwen3.5 4B Q4_K_M as the default local model for the 8 GB GPU.
- [ ] Qwen3.5 9B Q4_K_M only as an optional, preflight-gated Quality profile.
- [ ] Ollama for MVP and llama.cpp only for later installer bundling.
- [ ] 4K context, thinking disabled, concurrency 1, and strict schemas for routine tasks.
- [ ] Deterministic candidate generation and stream selection; LLM only for ambiguous matching, bounded labels, and recommendation reranking.
- [ ] No direct browser-to-model access and no secrets/arbitrary shell/network/database tools.
- [ ] Explicit, privacy-classified opt-in for any future remote inference; no silent failover.
- [ ] General search through a replaceable authorized provider (proposed first adapter: Brave Search), not scraped Google result pages.

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

