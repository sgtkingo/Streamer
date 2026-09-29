import type {
  AgentProvider,
  CanonicalTitlePayload,
  MediaProvider,
  MetadataProvider,
} from "@streamer-ai/contracts";
import { describe, expect, it, vi } from "vitest";
import { LiveContentCoordinator } from "../src/services/live-content-coordinator.js";
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
});
