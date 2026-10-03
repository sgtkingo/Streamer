import {
  CatalogTitleSchema,
  DiscoveryResponseSchema,
  HomeFeedSchema,
  type AgentProvider,
  type CatalogTitle,
  type DiscoveryRequest,
  type DiscoveryResponse,
  type FieldProvenance,
  type MediaCandidate,
  type MediaCandidateRef,
  type MediaFormat,
  type PlaybackLanguageAvailability,
  type MediaProvider,
  type MetadataCandidate,
  type MetadataProvider,
  type ProviderContext,
  type RankedTitle,
  type SeriesDetail,
  type SeriesStructure,
  type EpisodeSelection,
} from "@streamer-ai/contracts";
import { createHash } from "node:crypto";
import type { RuntimeConfig } from "../runtime-config.js";
import type { IntegrationStateStore } from "../stores/integration-state-store.js";
import type {
  DiscoveryConversationContext,
  HomeFeedInput,
  StreamerContentProvider,
} from "./content-provider.js";

const AGENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["people", "candidates"],
  properties: {
    acknowledgement: { type: "string", maxLength: 220 },
    people: {
      type: "array",
      maxItems: 3,
      items: { type: "string", minLength: 1, maxLength: 160 },
    },
    candidates: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "kind", "year", "reason", "matchPercent"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 240 },
          kind: { type: "string", enum: ["movie", "series"] },
          year: {
            anyOf: [
              { type: "integer", minimum: 1870, maximum: 2200 },
              { type: "null" },
            ],
          },
          reason: { type: "string", minLength: 1, maxLength: 280 },
          matchPercent: { type: "integer", minimum: 1, maximum: 100 },
        },
      },
    },
  },
} as const;

interface AgentCandidate {
  title: string;
  kind: "movie" | "series";
  year: number | null;
  reason: string;
  matchPercent: number;
}

interface AgentPlan {
  acknowledgement: string;
  people: string[];
  candidates: AgentCandidate[];
}

interface ValidatedCandidate {
  ranked: RankedTitle;
  playbackCandidates: MediaCandidateRef[];
  seriesStructure?: SeriesStructure;
  episodeCandidates?: Map<string, MediaCandidateRef[]>;
}

interface SeriesSearchJob {
  structure?: SeriesStructure;
  candidates: Map<string, MediaCandidateRef[]>;
  running: boolean;
  failed: boolean;
  finished: boolean;
}

function episodeKey(titleId: string, episode: EpisodeSelection): string {
  return `${titleId}:${episode.seasonNumber}:${episode.episodeNumber}`;
}

export interface LiveContentCoordinatorOptions {
  agent: AgentProvider;
  metadata: MetadataProvider;
  media: MediaProvider;
  integrationStateStore: IntegrationStateStore;
  inference: RuntimeConfig["inference"];
  localeForProfile: (profileId: string) => "cs" | "en" | "de";
  now?: () => Date;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseAgentPlan(value: unknown): AgentPlan {
  const body = record(value);
  if (
    body === null ||
    !Array.isArray(body.people) ||
    !Array.isArray(body.candidates)
  ) {
    throw new Error("The discovery agent returned an invalid plan.");
  }
  const people = body.people.slice(0, 3).map((person) => {
    if (typeof person !== "string" || person.trim().length === 0) {
      throw new Error("The discovery agent returned an invalid person filter.");
    }
    return person.trim().slice(0, 160);
  });
  const candidates = body.candidates.slice(0, 6).map((raw) => {
    const item = record(raw);
    if (
      item === null ||
      typeof item.title !== "string" ||
      (item.kind !== "movie" && item.kind !== "series") ||
      !(
        item.year === null ||
        (Number.isInteger(item.year) &&
          Number(item.year) >= 1870 &&
          Number(item.year) <= 2200)
      ) ||
      typeof item.reason !== "string" ||
      !Number.isInteger(item.matchPercent)
    ) {
      throw new Error("The discovery agent returned an invalid candidate.");
    }
    const title = item.title.trim();
    const reason = item.reason.trim();
    const matchPercent = Number(item.matchPercent);
    if (
      title.length < 1 ||
      title.length > 240 ||
      reason.length < 1 ||
      reason.length > 280 ||
      matchPercent < 1 ||
      matchPercent > 100
    ) {
      throw new Error("The discovery agent returned an invalid candidate.");
    }
    return {
      title,
      kind: item.kind as "movie" | "series",
      year: item.year === null ? null : Number(item.year),
      reason,
      matchPercent,
    };
  });
  if (candidates.length === 0) {
    throw new Error("The discovery agent did not suggest any candidates.");
  }
  return {
    acknowledgement:
      typeof body.acknowledgement === "string"
        ? body.acknowledgement.trim().slice(0, 220)
        : "",
    people,
    candidates,
  };
}

function discoveryReply(
  locale: "cs" | "en" | "de",
  validatedCount: number,
  best: RankedTitle | null,
  acknowledgement: string,
): string {
  let summary: string;
  let question: string;
  if (locale === "cs") {
    question = "Je to to, co sis představoval? Napiš mi, co mám změnit.";
    if (best !== null)
      summary = `Nejlepší ověřený tip je ${best.title.title}. Níže jsou pouze tituly ověřené přes TMDB a Webshare.`;
    else if (validatedCount > 0)
      summary = `Našel jsem ${validatedCount} odpovídající tituly, ale Webshare u žádného nepotvrdil přehratelnou variantu.`;
    else
      summary =
        "Našel jsem několik námětů, ale žádný se nepodařilo spolehlivě ověřit přes TMDB a Webshare.";
  } else if (locale === "de") {
    question =
      "Ist das, was du dir vorgestellt hast? Sag mir, was ich ändern soll.";
    if (best !== null)
      summary = `Der beste geprüfte Tipp ist ${best.title.title}. Unten erscheinen nur über TMDB und Webshare geprüfte Titel.`;
    else if (validatedCount > 0)
      summary = `${validatedCount} passende Titel wurden gefunden, aber Webshare bestätigte keine abspielbare Variante.`;
    else
      summary =
        "Einige Ideen wurden gefunden, aber keine konnte zuverlässig über TMDB und Webshare geprüft werden.";
  } else {
    question = "Is this what you had in mind? Tell me what to change.";
    if (best !== null)
      summary = `The best validated match is ${best.title.title}. Only titles checked through TMDB and Webshare are shown below.`;
    else if (validatedCount > 0)
      summary = `${validatedCount} matching titles were found, but Webshare did not confirm a playable variant for any of them.`;
    else
      summary =
        "I found some ideas, but none could be validated reliably through TMDB and Webshare.";
  }
  return `${acknowledgement ? `${acknowledgement} ` : ""}${summary} ${question}`;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((word) => word.length > 1);
}

function titleMatchesRelease(
  candidate: MediaCandidate,
  title: string,
  originalTitle: string | null,
  year: number | null,
): boolean {
  const release = normalize(candidate.releaseName);
  const alternatives = [title, originalTitle]
    .filter((value): value is string => value !== null)
    .map(normalize);
  const matchingTitle = alternatives.some((alternative) => {
    if (release.includes(alternative)) return true;
    const titleWords = words(alternative);
    if (titleWords.length === 0) return false;
    const releaseWords = new Set(words(release));
    return (
      titleWords.filter((word) => releaseWords.has(word)).length /
        titleWords.length >=
      0.75
    );
  });
  if (!matchingTitle) return false;
  const releaseYears = candidate.releaseName.match(/\b(?:19|20)\d{2}\b/g);
  return (
    year === null ||
    releaseYears === null ||
    releaseYears.includes(String(year))
  );
}

function metadataScore(
  agent: AgentCandidate,
  candidate: MetadataCandidate,
): number {
  const requested = normalize(agent.title);
  const titles = [candidate.title, candidate.originalTitle]
    .filter((value): value is string => value !== null)
    .map(normalize);
  const titleScore = titles.includes(requested)
    ? 100
    : titles.some(
          (value) => value.includes(requested) || requested.includes(value),
        )
      ? 70
      : 0;
  const yearScore =
    agent.year === null || candidate.year === null
      ? 5
      : agent.year === candidate.year
        ? 20
        : Math.abs(agent.year - candidate.year) === 1
          ? 5
          : -30;
  return titleScore + yearScore + candidate.confidence * 10;
}

function accentColor(id: string): string {
  const digest = createHash("sha256").update(id).digest();
  const channels = [...digest.subarray(0, 3)].map((value) => 48 + (value % 96));
  return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function uniqueFormats(formats: readonly MediaFormat[]): MediaFormat[] {
  const seen = new Set<string>();
  return formats.filter((format) => {
    const key = JSON.stringify(format);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function episodeNumber(
  releaseName: string,
): { season: number; episode: number } | null {
  const match =
    /(?:^|[^a-z0-9])s(\d{1,2})[ ._-]*e(\d{1,3})(?:[^a-z0-9]|$)/i.exec(
      releaseName,
    ) ?? /(?:^|[^a-z0-9])(\d{1,2})x(\d{1,3})(?:[^a-z0-9]|$)/i.exec(releaseName);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  return { season: Number(match[1]), episode: Number(match[2]) };
}

function providerContext(
  request: DiscoveryRequest,
  locale: "cs" | "en" | "de",
  now: Date,
  signal?: AbortSignal,
): ProviderContext {
  return {
    requestId: request.idempotencyKey,
    profileId: request.profileId,
    locale,
    deadlineAt: new Date(now.getTime() + 55_000).toISOString(),
    secretRef: null,
    signal,
  };
}

/**
 * Live provider-neutral coordinator. The agent may only propose names and
 * ranking rationale; every field shown as fact comes from deterministic
 * metadata and media adapters.
 */
export class LiveContentCoordinator implements StreamerContentProvider {
  readonly id = "live";
  readonly mode = "live" as const;
  readonly #agent: AgentProvider;
  readonly #metadata: MetadataProvider;
  readonly #media: MediaProvider;
  readonly #integrationStateStore: IntegrationStateStore;
  readonly #inference: RuntimeConfig["inference"];
  readonly #localeForProfile: LiveContentCoordinatorOptions["localeForProfile"];
  readonly #now: () => Date;
  readonly #playbackCandidates = new Map<string, MediaCandidateRef[]>();
  readonly #seriesJobs = new Map<string, SeriesSearchJob>();

  constructor(options: LiveContentCoordinatorOptions) {
    this.#agent = options.agent;
    this.#metadata = options.metadata;
    this.#media = options.media;
    this.#integrationStateStore = options.integrationStateStore;
    this.#inference = options.inference;
    this.#localeForProfile = options.localeForProfile;
    this.#now = options.now ?? (() => new Date());
  }

  bootstrapTitles(): readonly CatalogTitle[] {
    return [];
  }

  buildHome(input: HomeFeedInput) {
    const items = input.titles.filter(
      (item) =>
        item.metadataProvenance !== undefined &&
        item.availabilityProvenance !== undefined &&
        item.ratings.every((rating) => rating.provenance !== undefined),
    );
    return HomeFeedSchema.parse({
      profileId: input.profileId,
      mode: "live",
      generatedAt: input.generatedAt,
      sections: [
        {
          id: "continue-watching",
          title: "Continue Watching",
          subtitle: "Pick up where you left off",
          freshness: "fresh",
          items: items
            .filter((item) => item.progressPercent !== null)
            .slice(0, 10),
        },
        {
          id: "new-releases",
          title: "New Releases",
          subtitle: "Recently validated titles",
          freshness: "fresh",
          items: [...items]
            .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
            .slice(0, 10),
        },
        {
          id: "trending",
          title: "Trending",
          subtitle: "Titles discovered on this device",
          freshness: "stale",
          items: items.slice(0, 10),
        },
        {
          id: "top-rated",
          title: "Top Rated",
          subtitle: "Strong TMDB ratings",
          freshness: "fresh",
          items: [...items]
            .sort(
              (a, b) => (b.ratings[0]?.value ?? 0) - (a.ratings[0]?.value ?? 0),
            )
            .slice(0, 10),
        },
        {
          id: "for-you",
          title: "Picks for You",
          subtitle: "Validated discoveries for this profile",
          freshness: "refreshing",
          items: items.slice(0, 10),
        },
      ],
    });
  }

  async discover(
    request: DiscoveryRequest,
    completedAt: string,
    conversation?: DiscoveryConversationContext,
  ): Promise<DiscoveryResponse> {
    conversation?.signal?.throwIfAborted();
    const missing = await this.missingRequiredIntegrations();
    conversation?.signal?.throwIfAborted();
    if (missing.length > 0) {
      return DiscoveryResponseSchema.parse({
        sessionId: request.sessionId,
        mode: "live",
        stage: "needs-setup",
        reply: `Complete the required connections before live discovery: ${missing.join(", ")}.`,
        bestMatch: null,
        available: [],
        unavailable: [],
        unverified: [],
        warnings: [
          "No preview records were substituted for missing live providers.",
        ],
        completedAt,
      });
    }

    const locale = this.#localeForProfile(request.profileId);
    const context = providerContext(
      request,
      locale,
      this.#now(),
      conversation?.signal,
    );
    const history = (conversation?.messages ?? []).slice(-8).map((message) => {
      const data = record(message.content);
      const previousTitles = Array.isArray(data?.titles)
        ? data.titles
            .filter((title): title is string => typeof title === "string")
            .slice(0, 6)
        : [];
      return {
        role: message.role,
        content:
          typeof data?.message === "string"
            ? data.message
            : typeof data?.reply === "string"
              ? `${data.reply}${previousTitles.length ? ` Previously suggested: ${previousTitles.join(", ")}.` : ""}`
              : typeof message.content === "string"
                ? message.content
                : JSON.stringify(message.content),
      };
    });
    const generation = await this.#agent.generateStructured<unknown>(
      {
        model: this.#inference.model,
        messages: [
          {
            role: "system",
            content: `You propose films and series for a ${locale} user. The latest message may be feedback on an earlier shortlist: keep the user's original preferences unless revised, apply objections, and avoid previously suggested titles the user rejected. Put only currently required people in the people array; omit people the user rejected. Return exactly 6 real, correctly spelled candidate titles that best satisfy the latest request and conversation. Every candidate must actually feature each currently required person. Prefer well-known titles when uncertain. Use your knowledge only to propose title, kind, approximate release year, a short preference-based reason, and match score. Add a brief acknowledgement in the user's language that responds to their latest preference or objection; do not name unvalidated titles or claim availability, ratings, or other unverified facts in it. Do not invent metadata, availability, ratings, people, or URLs. Output only the requested JSON.`,
          },
          ...history,
          ...(history.some(
            (message) =>
              message.role === "user" &&
              message.content.includes(request.message),
          )
            ? []
            : [{ role: "user" as const, content: request.message }]),
        ],
        outputSchemaName: "streamer_ai_discovery_candidates",
        outputJsonSchema: AGENT_SCHEMA,
        allowedToolNames: [],
        temperature: 0.35,
        maxOutputTokens: this.#inference.maxOutputTokens,
      },
      context,
    );
    context.signal?.throwIfAborted();
    const plan = parseAgentPlan(generation.output);
    const validated: ValidatedCandidate[] = [];
    const warnings: string[] = [];
    const seen = new Set<string>();
    for (const candidate of plan.candidates) {
      context.signal?.throwIfAborted();
      try {
        const result = await this.validateCandidate(
          candidate,
          plan.people[0] ?? null,
          context,
        );
        if (result === null || seen.has(result.ranked.title.id)) continue;
        seen.add(result.ranked.title.id);
        validated.push(result);
      } catch {
        context.signal?.throwIfAborted();
        warnings.push(
          `Could not validate '${candidate.title}' against live providers.`,
        );
      }
    }

    context.signal?.throwIfAborted();

    const available = validated
      .filter((item) =>
        ["available", "partial"].includes(item.ranked.title.availability),
      )
      .sort(
        (a, b) =>
          (b.ranked.title.matchPercent ?? 0) -
          (a.ranked.title.matchPercent ?? 0),
      );
    const best = available.shift() ?? null;
    const highestOther = Math.max(
      0,
      ...validated
        .filter((item) => item !== best)
        .map((item) => item.ranked.title.matchPercent ?? 0),
    );
    if (best !== null && (best.ranked.title.matchPercent ?? 0) < highestOther) {
      best.ranked = {
        ...best.ranked,
        title: { ...best.ranked.title, matchPercent: highestOther },
      };
    }
    for (const item of validated) {
      if (item.playbackCandidates.length > 0) {
        this.#playbackCandidates.set(
          item.ranked.title.id,
          item.playbackCandidates,
        );
      }
      if (item.ranked.title.kind === "series") {
        this.#seriesJobs.set(item.ranked.title.id, {
          structure: item.seriesStructure,
          candidates: item.episodeCandidates ?? new Map(),
          running: false,
          failed: false,
          finished: false,
        });
        void this.getSeriesDetail(request.profileId, item.ranked.title);
      }
    }

    return DiscoveryResponseSchema.parse({
      sessionId: request.sessionId,
      mode: "live",
      stage: "completed",
      reply: discoveryReply(
        locale,
        validated.length,
        best?.ranked ?? null,
        plan.acknowledgement,
      ),
      bestMatch: best?.ranked ?? null,
      available: available.map((item) => item.ranked),
      unavailable: validated
        .filter((item) => item.ranked.title.availability === "unavailable")
        .map((item) => item.ranked),
      unverified: validated
        .filter((item) => item.ranked.title.availability === "unknown")
        .map((item) => item.ranked),
      warnings: [...new Set(warnings)].slice(0, 20),
      completedAt,
    });
  }

  async checkPlayback(
    profileId: string,
    title: CatalogTitle,
    episode?: EpisodeSelection,
  ): Promise<PlaybackLanguageAvailability | void> {
    const { candidates, context } = await this.playbackCandidates(
      profileId,
      title,
      episode,
    );
    if (this.#media.checkPlayback === undefined) {
      throw new Error("The media source does not support playback checks.");
    }
    let lastError: unknown = new Error(
      "No playback candidate remains available.",
    );
    for (const candidate of candidates) {
      try {
        return await this.#media.checkPlayback(candidate, context);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async preparePlayback(
    profileId: string,
    title: CatalogTitle,
    episode?: EpisodeSelection,
  ) {
    const { candidates, context } = await this.playbackCandidates(
      profileId,
      title,
      episode,
    );
    if (candidates.length === 0)
      throw new Error("No playback candidate remains available.");
    let lastError: unknown = new Error(
      "No playback candidate remains available.",
    );
    for (const candidate of candidates) {
      try {
        const variant = await this.#media.inspect(candidate, context);
        return await this.#media.createPlayback(
          {
            profileId,
            titleId: title.id,
            seasonNumber: episode?.seasonNumber ?? null,
            episodeNumber: episode?.episodeNumber ?? null,
            variant: { ...candidate, variantId: variant.variantId },
            startPositionSeconds: 0,
          },
          context,
        );
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async getSeriesDetail(
    profileId: string,
    title: CatalogTitle,
    retry = false,
  ): Promise<SeriesDetail> {
    let job = this.#seriesJobs.get(title.id);
    if (!job) {
      job = {
        candidates: new Map(),
        running: false,
        failed: false,
        finished: false,
      };
      this.#seriesJobs.set(title.id, job);
    }
    if (retry && job.failed) job.failed = false;
    if (!job.running && !job.finished && !job.failed) {
      job.running = true;
      void this.searchSeriesEpisodes(profileId, title, job).catch(() => {
        job.failed = true;
        job.running = false;
      });
    }
    const seasons =
      job.structure?.seasons.map((season) => ({
        seasonNumber: season.seasonNumber,
        title: season.title,
        episodes: season.episodes.map((episode) => ({
          seasonNumber: season.seasonNumber,
          episodeNumber: episode.episodeNumber,
          title: episode.title,
          airDate: episode.airDate,
          availability: job.candidates.has(
            episodeKey(title.id, {
              seasonNumber: season.seasonNumber,
              episodeNumber: episode.episodeNumber,
            }),
          )
            ? ("available" as const)
            : job.running
              ? ("searching" as const)
              : ("unavailable" as const),
        })),
      })) ?? [];
    const available = seasons
      .flatMap((season) => season.episodes)
      .filter((episode) => episode.availability === "available").length;
    return {
      status: job.failed
        ? "failed"
        : job.running
          ? "searching"
          : available === 0
            ? "unavailable"
            : job.structure?.complete &&
                seasons.every((season) =>
                  season.episodes.every(
                    (episode) => episode.availability === "available",
                  ),
                )
              ? "complete"
              : "partial",
      seasons,
    };
  }

  private async searchSeriesEpisodes(
    profileId: string,
    title: CatalogTitle,
    job: SeriesSearchJob,
  ): Promise<void> {
    const { context } = await this.playbackCandidates(profileId, title);
    let hadErrors = false;
    if (!job.structure) {
      const externalId = /^sai:tmdb:series:(\d+)$/.exec(title.id)?.[1];
      if (!externalId)
        throw new Error("Series metadata reference is unavailable.");
      job.structure = await this.#metadata.getSeriesStructure(
        { providerId: "tmdb", entityType: "series", externalId },
        context,
      );
    }
    for (const season of job.structure.seasons) {
      for (const episode of season.episodes) {
        const selection = {
          seasonNumber: season.seasonNumber,
          episodeNumber: episode.episodeNumber,
        };
        const key = episodeKey(title.id, selection);
        if (
          job.candidates.has(key) ||
          (episode.airDate &&
            episode.airDate > this.#now().toISOString().slice(0, 10))
        )
          continue;
        try {
          const episodeContext = {
            ...context,
            requestId: `${context.requestId}-${selection.seasonNumber}-${selection.episodeNumber}`,
            deadlineAt: new Date(this.#now().getTime() + 55_000).toISOString(),
          };
          const results = await this.#media.search(
            {
              titleId: title.id,
              kind: "series",
              title: title.title,
              originalTitle: title.originalTitle,
              year: title.year,
              seasonNumber: selection.seasonNumber,
              episodeNumber: selection.episodeNumber,
              externalRefs: [],
              limit: 20,
            },
            episodeContext,
          );
          for (const candidate of results) {
            const parsed = episodeNumber(candidate.releaseName);
            if (
              !parsed ||
              parsed.season !== selection.seasonNumber ||
              parsed.episode !== selection.episodeNumber ||
              !titleMatchesRelease(
                candidate,
                title.title,
                title.originalTitle,
                null,
              )
            )
              continue;
            try {
              await this.#media.inspect(candidate.ref, episodeContext);
              job.candidates.set(key, [candidate.ref]);
              break;
            } catch {
              // Restricted or non-video files are never displayed as playable.
            }
          }
        } catch {
          // A single failed lookup must not block the remaining seasons.
          hadErrors = true;
        }
      }
    }
    job.running = false;
    job.finished = !hadErrors;
    job.failed = hadErrors;
  }

  private async playbackCandidates(
    profileId: string,
    title: CatalogTitle,
    episode?: EpisodeSelection,
  ) {
    const locale = this.#localeForProfile(profileId);
    const request: DiscoveryRequest = {
      profileId,
      message: title.title,
      idempotencyKey: `playback-${createHash("sha256").update(`${profileId}:${title.id}:${this.#now().toISOString()}`).digest("hex").slice(0, 24)}`,
    };
    const context = providerContext(request, locale, this.#now());
    let candidates = episode
      ? (this.#seriesJobs
          .get(title.id)
          ?.candidates.get(episodeKey(title.id, episode)) ?? [])
      : (this.#playbackCandidates.get(title.id) ?? []);
    if (candidates.length === 0) {
      const results = await this.#media.search(
        {
          titleId: title.id,
          kind: title.kind,
          title: title.title,
          originalTitle: title.originalTitle,
          year: title.year,
          seasonNumber: episode?.seasonNumber ?? null,
          episodeNumber: episode?.episodeNumber ?? null,
          externalRefs: [],
          limit: 20,
        },
        context,
      );
      candidates = results
        .filter(
          (item) =>
            titleMatchesRelease(
              item,
              title.title,
              title.originalTitle,
              title.kind === "series" ? null : title.year,
            ) &&
            (episode === undefined ||
              (() => {
                const parsed = episodeNumber(item.releaseName);
                return (
                  parsed?.season === episode.seasonNumber &&
                  parsed.episode === episode.episodeNumber
                );
              })()),
        )
        .slice(0, 12)
        .map((item) => item.ref);
      if (episode && candidates.length > 0) {
        const job = this.#seriesJobs.get(title.id);
        job?.candidates.set(episodeKey(title.id, episode), candidates);
      }
    }
    return { candidates, context };
  }

  private async missingRequiredIntegrations(): Promise<string[]> {
    const states = await Promise.all(
      ["tmdb", "webshare", "ollama"].map((id) =>
        this.#integrationStateStore.get(id),
      ),
    );
    return ["TMDB", "Webshare", "Ollama"].filter(
      (_name, index) => states[index]?.configured !== true,
    );
  }

  private async validateCandidate(
    agent: AgentCandidate,
    person: string | null,
    context: ProviderContext,
  ): Promise<ValidatedCandidate | null> {
    const metadataCandidates = await this.#metadata.search(
      {
        query: agent.title,
        kind: agent.kind,
        year: agent.year,
        person,
        locale: context.locale,
        limit: 5,
      },
      context,
    );
    const selected = [...metadataCandidates]
      .map((candidate) => ({
        candidate,
        score: metadataScore(agent, candidate),
      }))
      .sort((a, b) => b.score - a.score)[0];
    if (selected === undefined || selected.score < 60) return null;
    const metadata = await this.#metadata.getTitle(
      selected.candidate.ref,
      context,
    );
    const ratings = await this.#metadata.getRatings(
      selected.candidate.ref,
      context,
    );
    const titleId = `sai:tmdb:${metadata.kind}:${metadata.ref.externalId}`;
    const checkedAt = this.#now().toISOString();
    let availability: CatalogTitle["availability"] = "unknown";
    let formats: MediaFormat[] = [];
    let availabilityProvenance: FieldProvenance = {
      providerId: "webshare",
      retrievedAt: checkedAt,
      connectorVersion: this.#media.descriptor().connectorVersion,
      confidence: 0,
      validationState: "unverified",
      expiresAt: null,
    };
    let seriesCoverage: CatalogTitle["seriesCoverage"] = null;
    let playbackCandidates: MediaCandidateRef[] = [];
    let seriesStructure: SeriesStructure | undefined;
    const episodeCandidates = new Map<string, MediaCandidateRef[]>();
    try {
      const mediaCandidates = await this.#media.search(
        {
          titleId,
          kind: metadata.kind,
          title: metadata.title,
          originalTitle: metadata.originalTitle,
          year: metadata.year,
          seasonNumber: null,
          episodeNumber: null,
          externalRefs: [metadata.ref],
          limit: metadata.kind === "series" ? 50 : 20,
        },
        context,
      );
      const matching = mediaCandidates.filter((candidate) =>
        titleMatchesRelease(
          candidate,
          metadata.title,
          metadata.originalTitle,
          metadata.kind === "series" ? null : metadata.year,
        ),
      );
      const inspected = [];
      for (const candidate of matching.slice(0, 12)) {
        context.signal?.throwIfAborted();
        if (
          metadata.kind === "series" &&
          episodeNumber(candidate.releaseName) === null
        ) {
          continue;
        }
        try {
          inspected.push({
            candidate,
            variant: await this.#media.inspect(candidate.ref, context),
          });
        } catch {
          context.signal?.throwIfAborted();
          // A rejected/restricted file is not playable and is skipped.
        }
      }
      if (inspected.length > 0) {
        formats = uniqueFormats(inspected.map((item) => item.variant.format));
        playbackCandidates = inspected.map((item) => item.candidate.ref);
        availabilityProvenance =
          inspected[0]?.variant.provenance ?? availabilityProvenance;
        if (metadata.kind === "movie") {
          availability = "available";
        } else {
          const structure = await this.#metadata.getSeriesStructure(
            metadata.ref,
            context,
          );
          seriesStructure = structure;
          const expectedEpisodes = structure.seasons.reduce(
            (count, season) => count + season.episodes.length,
            0,
          );
          const found = new Map<string, { season: number; episode: number }>();
          for (const item of inspected) {
            const episode = episodeNumber(item.candidate.releaseName);
            if (episode !== null) {
              found.set(`${episode.season}:${episode.episode}`, episode);
              const key = episodeKey(titleId, {
                seasonNumber: episode.season,
                episodeNumber: episode.episode,
              });
              episodeCandidates.set(key, [
                ...(episodeCandidates.get(key) ?? []),
                item.candidate.ref,
              ]);
            }
          }
          const seasonsAvailable = new Set(
            [...found.values()].map((episode) => episode.season),
          ).size;
          const seasonsTotal = structure.seasons.filter(
            (season) => season.episodes.length > 0,
          ).length;
          const complete =
            expectedEpisodes > 0 &&
            found.size === expectedEpisodes &&
            structure.complete;
          seriesCoverage = {
            seasonsAvailable,
            seasonsTotal,
            episodesAvailable: found.size,
            episodesTotal: expectedEpisodes,
            complete,
            nextEpisodeLabel: null,
          };
          availability = complete ? "available" : "partial";
        }
      } else {
        availability = "unavailable";
        availabilityProvenance = {
          ...availabilityProvenance,
          confidence: 1,
          validationState: "verified",
        };
      }
    } catch {
      context.signal?.throwIfAborted();
      availability = "unknown";
    }

    const title = CatalogTitleSchema.parse({
      id: titleId,
      kind: metadata.kind,
      title: metadata.title,
      originalTitle: metadata.originalTitle,
      year: metadata.year,
      synopsis: metadata.synopsis,
      posterUrl: metadata.posterUrl,
      backdropUrl: metadata.backdropUrl,
      accentColor: accentColor(titleId),
      genres: metadata.genres,
      ratings,
      matchPercent: agent.matchPercent,
      availability,
      availabilityProvider: "webshare",
      availabilityCheckedAt: checkedAt,
      formats,
      seriesCoverage,
      metadataProvider: "tmdb",
      metadataValidatedAt:
        metadata.fieldProvenance.title?.retrievedAt ?? checkedAt,
      metadataProvenance:
        metadata.fieldProvenance.title ?? selected.candidate.provenance,
      availabilityProvenance,
      inLibrary: false,
      progressPercent: null,
    });
    return {
      ranked: { title, reason: agent.reason },
      playbackCandidates,
      seriesStructure,
      episodeCandidates,
    };
  }
}
