import type {
  AgentProvider,
  CanonicalTitlePayload,
  MediaProvider,
  MetadataProvider,
} from "@streamer-ai/contracts";
import { describe, expect, it, vi } from "vitest";
import { LiveContentCoordinator } from "../src/services/live-content-coordinator.js";
import { PreviewContentProvider } from "../src/services/content-provider.js";
import { NonPersistentMemoryIntegrationStateStore } from "../src/stores/integration-state-store.js";

const NOW = "2026-09-29T20:00:00.000Z";
const provenance = {
  providerId: "tmdb",
  retrievedAt: NOW,
  connectorVersion: "test",
  confidence: 1,
  validationState: "verified" as const,
  expiresAt: null,
};

function metadataPayload(id: string, title: string): CanonicalTitlePayload {
  return {
    ref: { providerId: "tmdb", externalId: id, entityType: "movie" },
    kind: "movie",
    title,
    originalTitle: title,
    localizedTitles: [{ locale: "en", value: title, provenance }],
    year: id === "1" ? 2001 : 2002,
    synopsis: `Validated synopsis for ${title}.`,
    genres: ["Drama"],
    posterUrl: `https://image.tmdb.org/${id}.jpg`,
    backdropUrl: null,
    fieldProvenance: {
      title: provenance,
      originalTitle: provenance,
      year: provenance,
      synopsis: provenance,
      genres: provenance,
      posterUrl: provenance,
      backdropUrl: provenance,
    },
  };
}

async function connectedStateStore() {
  const store = new NonPersistentMemoryIntegrationStateStore();
  for (const integrationId of ["tmdb", "webshare", "ollama"]) {
    await store.set({
      integrationId,
      status: "connected",
      configured: true,
      checkedAt: NOW,
      updatedAt: NOW,
    });
  }
  return store;
}

function coordinatorDependencies() {
  const generateStructured = vi.fn().mockResolvedValue({
    output: {
      acknowledgement: "I tuned the mood to your request.",
      people: [],
      candidates: [
        {
          title: "Agent title one",
          kind: "movie",
          year: 2001,
          reason: "The agent's first reason.",
          matchPercent: 82,
        },
        {
          title: "Agent title two",
          kind: "movie",
          year: 2002,
          reason: "The agent's second reason.",
          matchPercent: 95,
        },
      ],
    },
    model: "qwen3.5:4b",
    finishReason: "completed",
    inputTokens: 10,
    outputTokens: 20,
    provenance,
  });
  const agent = { generateStructured } as unknown as AgentProvider;
  const searchMetadata = vi.fn().mockImplementation(async (query) => {
    const first = query.query.includes("one");
    return [
      {
        ref: {
          providerId: "tmdb",
          externalId: first ? "1" : "2",
          entityType: "movie",
        },
        kind: "movie",
        title: query.query,
        originalTitle: query.query,
        year: first ? 2001 : 2002,
        confidence: 1,
        provenance,
      },
    ];
  });
  const metadata = {
    search: searchMetadata,
    getTitle: vi
      .fn()
      .mockImplementation(async (ref) =>
        metadataPayload(
          ref.externalId,
          ref.externalId === "1" ? "Canonical One" : "Canonical Two",
        ),
      ),
    getRatings: vi
      .fn()
      .mockResolvedValue([
        { source: "TMDB", value: 8, scale: 10, votes: 100, provenance },
      ]),
  } as unknown as MetadataProvider;
  const searchMedia = vi.fn().mockImplementation(async (request) =>
    request.title.includes("One")
      ? [
          {
            ref: { providerId: "webshare", candidateId: "file-1" },
            releaseName: "Canonical.One.2001.1080p.mkv",
            sizeBytes: 10,
            seasonNumber: null,
            episodeNumber: null,
            confidence: 0.8,
            provenance: { ...provenance, providerId: "webshare" },
          },
        ]
      : [],
  );
  const media = {
    descriptor: () => ({ connectorVersion: "test" }),
    search: searchMedia,
    inspect: vi.fn().mockResolvedValue({
      ref: { providerId: "webshare", candidateId: "file-1" },
      variantId: "file-1",
      format: {
        label: "1080p · H.264",
        container: "mkv",
        resolution: "1080p",
        videoCodec: "H.264",
        audioLanguages: ["en"],
        subtitleLanguages: [],
      },
      directPlay: true,
      supportsHttpRange: true,
      embeddedSubtitles: [],
      provenance: { ...provenance, providerId: "webshare" },
      expiresAt: null,
    }),
  } as unknown as MediaProvider;
  return { agent, generateStructured, metadata, media };
}

describe("LiveContentCoordinator", () => {
  it("fills an episode guide in the background while an already verified episode stays playable", async () => {
    const preview = new PreviewContentProvider()
      .bootstrapTitles()
      .find((item) => item.kind === "series")!;
    const title = {
      ...preview,
      id: "sai:tmdb:series:42",
      title: "Sample Show",
      originalTitle: "Sample Show",
      year: 2021,
    };
    const first = {
      ref: { providerId: "webshare", candidateId: "episode-1" },
      releaseName: "Sample.Show.2021.S01E01.mkv",
      sizeBytes: 100,
      seasonNumber: 1,
      episodeNumber: 1,
      confidence: 0.9,
      provenance: { ...provenance, providerId: "webshare" },
    };
    const second = {
      ...first,
      ref: { providerId: "webshare", candidateId: "episode-2" },
      releaseName: "Sample.Show.2021.S01E02.mkv",
      episodeNumber: 2,
    };
    let releaseSecond!: (value: (typeof second)[]) => void;
    const secondSearch = new Promise<(typeof second)[]>((resolve) => {
      releaseSecond = resolve;
    });
    const media = {
      search: vi
        .fn()
        .mockImplementation(async (request) =>
          request.episodeNumber === 1
            ? [first]
            : request.episodeNumber === 2
              ? secondSearch
              : [],
        ),
      inspect: vi.fn().mockImplementation(async (ref) => ({
        ref,
        variantId: ref.candidateId,
      })),
      createPlayback: vi.fn().mockResolvedValue({ titleId: title.id }),
    } as unknown as MediaProvider;
    const metadata = {
      getSeriesStructure: vi.fn().mockResolvedValue({
        seriesRef: {
          providerId: "tmdb",
          entityType: "series",
          externalId: "42",
        },
        seasons: [
          {
            ref: { providerId: "tmdb", entityType: "season", externalId: "43" },
            seasonNumber: 1,
            title: "Season One",
            provenance,
            episodes: [1, 2].map((episodeNumber) => ({
              ref: {
                providerId: "tmdb",
                entityType: "episode",
                externalId: String(43 + episodeNumber),
              },
              episodeNumber,
              title: `Episode ${episodeNumber}`,
              airDate: "2021-01-01",
              runtimeMinutes: 42,
              provenance,
            })),
          },
        ],
        complete: true,
        provenance,
      }),
    } as unknown as MetadataProvider;
    const coordinator = new LiveContentCoordinator({
      agent: {} as AgentProvider,
      metadata,
      media,
      integrationStateStore: await connectedStateStore(),
      inference: {
        provider: "ollama",
        baseUrl: "http://127.0.0.1:11434",
        model: "qwen3.5:4b",
        minimumVersion: "0.5.0",
        contextTokens: 4096,
        maxOutputTokens: 512,
        timeoutMs: 60_000,
      },
      localeForProfile: () => "en",
      now: () => new Date(NOW),
    });
    await coordinator.getSeriesDetail("default", title);
    await vi.waitFor(async () => {
      const detail = await coordinator.getSeriesDetail("default", title);
      expect(detail.seasons[0]?.episodes[0]?.availability).toBe("available");
      expect(detail.seasons[0]?.episodes[1]?.availability).toBe("searching");
    });
    await coordinator.preparePlayback("default", title, {
      seasonNumber: 1,
      episodeNumber: 1,
    });
    expect(media.createPlayback).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: expect.objectContaining({ candidateId: "episode-1" }),
      }),
      expect.anything(),
    );
    releaseSecond([second]);
    await vi.waitFor(async () => {
      expect((await coordinator.getSeriesDetail("default", title)).status).toBe(
        "complete",
      );
    });
  });
  it("uses the agent only for proposals and groups deterministically validated titles", async () => {
    const dependencies = coordinatorDependencies();
    const coordinator = new LiveContentCoordinator({
      ...dependencies,
      integrationStateStore: await connectedStateStore(),
      inference: {
        provider: "ollama",
        baseUrl: "http://127.0.0.1:11434",
        model: "qwen3.5:4b",
        minimumVersion: "0.5.0",
        contextTokens: 4096,
        maxOutputTokens: 512,
        timeoutMs: 60_000,
      },
      localeForProfile: () => "en",
      now: () => new Date(NOW),
    });

    const response = await coordinator.discover(
      {
        profileId: "default",
        sessionId: "session-1",
        message: "Find two films",
        idempotencyKey: "request-1",
      },
      NOW,
    );

    expect(response.mode).toBe("live");
    expect(response.bestMatch?.title.title).toBe("Canonical One");
    expect(response.bestMatch?.title.availability).toBe("available");
    expect(response.bestMatch?.title.matchPercent).toBe(95);
    expect(response.unavailable).toHaveLength(1);
    expect(response.unavailable[0]?.title.title).toBe("Canonical Two");
    expect(response.unavailable[0]?.title.metadataProvider).toBe("tmdb");
    expect(response.available).toHaveLength(0);
    expect(response.reply).toContain("I tuned the mood to your request.");
    expect(response.reply).toContain("Is this what you had in mind?");
  });

  it("passes prior validated suggestions and user objections back to the agent", async () => {
    const dependencies = coordinatorDependencies();
    const coordinator = new LiveContentCoordinator({
      ...dependencies,
      integrationStateStore: await connectedStateStore(),
      inference: {
        provider: "ollama",
        baseUrl: "http://127.0.0.1:11434",
        model: "qwen3.5:4b",
        minimumVersion: "0.5.0",
        contextTokens: 4096,
        maxOutputTokens: 512,
        timeoutMs: 60_000,
      },
      localeForProfile: () => "en",
      now: () => new Date(NOW),
    });

    await coordinator.discover(
      {
        profileId: "default",
        sessionId: "conversation-one",
        message: "Less spooky, please",
        idempotencyKey: "request-feedback",
      },
      NOW,
      {
        sessionId: "conversation-one",
        messages: [
          {
            role: "user",
            content: { message: "An autumn mystery" },
            createdAt: NOW,
          },
          {
            role: "assistant",
            content: { reply: "Try Canonical One.", titles: ["Canonical One"] },
            createdAt: NOW,
          },
          {
            role: "user",
            content: { message: "Less spooky, please" },
            createdAt: NOW,
          },
        ],
      },
    );
    const input = dependencies.generateStructured.mock.calls[0]?.[0];
    expect(input.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: "Less spooky, please",
        }),
        expect.objectContaining({
          role: "assistant",
          content: expect.stringContaining(
            "Previously suggested: Canonical One",
          ),
        }),
      ]),
    );
  });

  it("returns needs-setup without invoking the model when a provider is disconnected", async () => {
    const dependencies = coordinatorDependencies();
    const coordinator = new LiveContentCoordinator({
      ...dependencies,
      integrationStateStore: new NonPersistentMemoryIntegrationStateStore(),
      inference: {
        provider: "ollama",
        baseUrl: "http://127.0.0.1:11434",
        model: "qwen3.5:4b",
        minimumVersion: "0.5.0",
        contextTokens: 4096,
        maxOutputTokens: 512,
        timeoutMs: 60_000,
      },
      localeForProfile: () => "en",
      now: () => new Date(NOW),
    });

    const response = await coordinator.discover(
      {
        profileId: "default",
        sessionId: "session-2",
        message: "Find a film",
        idempotencyKey: "request-2",
      },
      NOW,
    );

    expect(response.stage).toBe("needs-setup");
    expect(response.bestMatch).toBeNull();
    expect(dependencies.generateStructured).not.toHaveBeenCalled();
  });

  it("tries the next verified media mirror when playback creation fails", async () => {
    const dependencies = coordinatorDependencies();
    const first = {
      ref: { providerId: "webshare", candidateId: "file-broken" },
      releaseName: "Canonical.One.2001.1080p.mkv",
      sizeBytes: 10,
      seasonNumber: null,
      episodeNumber: null,
      confidence: 0.8,
      provenance: { ...provenance, providerId: "webshare" },
    };
    const second = {
      ...first,
      ref: { providerId: "webshare", candidateId: "file-working" },
      releaseName: "Canonical.One.2001.720p.mkv",
    };
    vi.mocked(dependencies.media.search).mockImplementation(async (request) =>
      request.title.includes("One") ? [first, second] : [],
    );
    vi.mocked(dependencies.media.inspect).mockImplementation(async (ref) => ({
      ref,
      variantId: ref.candidateId,
      format: {
        label: "1080p · H.264",
        container: "mkv",
        resolution: "1080p",
        videoCodec: "H.264",
        audioLanguages: ["en"],
        subtitleLanguages: [],
      },
      directPlay: true,
      supportsHttpRange: true,
      embeddedSubtitles: [],
      provenance: { ...provenance, providerId: "webshare" },
      expiresAt: null,
    }));
    const createPlayback = vi
      .fn()
      .mockRejectedValueOnce(new Error("mirror unavailable"))
      .mockResolvedValueOnce({
        grantId: "grant-working",
        titleId: "sai:tmdb:movie:1",
        providerId: "webshare",
        variantId: "file-working",
        url: "/api/v1/playback/grants/grant-working",
        supportsHttpRange: true,
        expiresAt: "2026-09-29T20:01:00.000Z",
        embeddedSubtitles: [],
      });
    dependencies.media.createPlayback = createPlayback;
    const coordinator = new LiveContentCoordinator({
      ...dependencies,
      integrationStateStore: await connectedStateStore(),
      inference: {
        provider: "ollama",
        baseUrl: "http://127.0.0.1:11434",
        model: "qwen3.5:4b",
        minimumVersion: "0.5.0",
        contextTokens: 4096,
        maxOutputTokens: 512,
        timeoutMs: 60_000,
      },
      localeForProfile: () => "en",
      now: () => new Date(NOW),
    });
    const response = await coordinator.discover(
      {
        profileId: "default",
        sessionId: "session-mirrors",
        message: "Find two films",
        idempotencyKey: "request-mirrors",
      },
      NOW,
    );

    const grant = await coordinator.preparePlayback(
      "default",
      response.bestMatch!.title,
    );

    expect(createPlayback).toHaveBeenCalledTimes(2);
    expect(grant.variantId).toBe("file-working");
  });
});
