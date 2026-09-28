import { afterEach, describe, expect, it } from "vitest";
import {
  CatalogTitleSchema,
  DiscoveryResponseSchema,
  HomeFeedSchema,
} from "@streamer-ai/contracts";
import {
  createApp,
  type FetchLike,
  type StreamerContentProvider,
} from "../src/index.js";

const unusedFetch: FetchLike = async () => {
  throw new Error("External providers must not run in content route tests");
};

describe("provider-neutral content API", () => {
  const apps: ReturnType<typeof createApp>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function app() {
    const instance = createApp({
      environment: "test",
      logger: false,
      fetch: unusedFetch,
      now: () => new Date("2026-09-27T12:00:00.000Z"),
    });
    apps.push(instance);
    return instance;
  }

  it("returns all populated Home sections and labels the development fallback", async () => {
    const result = await app().inject({
      method: "GET",
      url: "/api/v1/home?profileId=default",
    });

    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({
      profileId: "default",
      mode: "preview",
      sections: [
        { id: "continue-watching" },
        { id: "new-releases" },
        { id: "trending" },
        { id: "top-rated" },
        { id: "for-you" },
      ],
    });
  });

  it("keeps discovery groups canonical, distinct and explicit about preview facts", async () => {
    const result = await app().inject({
      method: "POST",
      url: "/api/v1/discovery/sessions",
      payload: {
        profileId: "default",
        message: "An autumn movie with Sandra Bullock",
        idempotencyKey: "request-0001",
      },
    });
    const body = result.json();

    expect(result.statusCode).toBe(200);
    expect(body.bestMatch.title).toMatchObject({
      title: "The Lake House",
      availability: "available",
    });
    expect(body.warnings[0]).toMatch(/Preview fixture/);
    const ids = [
      body.bestMatch.title.id,
      ...body.available.map((item: { title: { id: string } }) => item.title.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("adds explicit saves and playback starts to Library while appending History", async () => {
    const instance = app();
    const titleId = encodeURIComponent("sai:preview:lake-house");
    const saved = await instance.inject({
      method: "PUT",
      url: `/api/v1/profiles/default/library/${titleId}`,
    });
    const started = await instance.inject({
      method: "POST",
      url: "/api/v1/profiles/default/playback/start",
      payload: { titleId: "sai:preview:lake-house" },
    });
    const history = await instance.inject({
      method: "GET",
      url: "/api/v1/profiles/default/history",
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.json().items[0]).toMatchObject({
      membershipReason: "explicit",
      state: "saved",
    });
    expect(started.statusCode).toBe(200);
    expect(started.json().library.items[0]).toMatchObject({
      membershipReason: "playback",
      state: "in-progress",
    });
    expect(history.json().items).toHaveLength(1);
    expect(history.json().items[0]).toMatchObject({
      title: { title: "The Lake House" },
      completed: false,
    });
  });

  it("never offers playback for an unavailable title", async () => {
    const result = await app().inject({
      method: "POST",
      url: "/api/v1/profiles/default/playback/start",
      payload: { titleId: "sai:preview:before-sunrise" },
    });

    expect(result.statusCode).toBe(409);
    expect(result.json()).toMatchObject({
      error: { code: "TITLE_NOT_PLAYABLE" },
    });
  });

  it("persists dynamically discovered provider titles in the canonical cache", async () => {
    const discoveredTitle = CatalogTitleSchema.parse({
      id: "sai:test:dynamic-title",
      kind: "movie",
      title: "Dynamic title",
      originalTitle: null,
      year: 2026,
      synopsis: "A title returned by an injected discovery coordinator.",
      posterUrl: null,
      backdropUrl: null,
      accentColor: "#345678",
      genres: ["Drama"],
      ratings: [{ source: "Test DB", value: 80, scale: 100, votes: 42 }],
      matchPercent: 91,
      availability: "available",
      availabilityProvider: "test-media",
      availabilityCheckedAt: "2026-09-27T12:00:00.000Z",
      formats: [
        {
          label: "1080p",
          container: "mkv",
          resolution: "1080p",
          videoCodec: "H.264",
          audioLanguages: ["en"],
          subtitleLanguages: ["cs"],
        },
      ],
      seriesCoverage: null,
      metadataProvider: "test-db",
      metadataValidatedAt: "2026-09-27T12:00:00.000Z",
      inLibrary: false,
      progressPercent: null,
    });
    const contentProvider: StreamerContentProvider = {
      id: "test-coordinator",
      bootstrapTitles: () => [],
      buildHome: ({ profileId, generatedAt }) =>
        HomeFeedSchema.parse({
          profileId,
          mode: "live",
          generatedAt,
          sections: [],
        }),
      discover: async (request, completedAt) =>
        DiscoveryResponseSchema.parse({
          sessionId: request.sessionId ?? "dynamic-session",
          stage: "completed",
          reply: "Validated by injected test providers.",
          bestMatch: { title: discoveredTitle, reason: "Best test match." },
          available: [],
          unavailable: [],
          warnings: [],
          completedAt,
        }),
    };
    const instance = createApp({
      environment: "test",
      logger: false,
      fetch: unusedFetch,
      contentProvider,
      now: () => new Date("2026-09-27T12:00:00.000Z"),
    });
    apps.push(instance);

    const discovery = await instance.inject({
      method: "POST",
      url: "/api/v1/discovery/sessions",
      payload: {
        profileId: "default",
        message: "Find the dynamic test title",
        idempotencyKey: "dynamic-request-1",
      },
    });
    const saved = await instance.inject({
      method: "PUT",
      url: "/api/v1/profiles/default/library/sai%3Atest%3Adynamic-title",
    });

    expect(discovery.statusCode).toBe(200);
    expect(saved.statusCode).toBe(200);
    expect(saved.json().items[0].title.id).toBe("sai:test:dynamic-title");
  });
});
