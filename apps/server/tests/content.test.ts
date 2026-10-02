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
    const instance = app();
    const payload = {
      profileId: "default",
      message: "An autumn movie with Sandra Bullock",
      idempotencyKey: "request-0001",
    };
    const result = await instance.inject({
      method: "POST",
      url: "/api/v1/discovery/sessions",
      payload,
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

    const replay = await instance.inject({
      method: "POST",
      url: "/api/v1/discovery/sessions",
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(body);

    const conflict = await instance.inject({
      method: "POST",
      url: "/api/v1/discovery/sessions",
      payload: { ...payload, message: "A completely different request" },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
  });

  it("keeps explicit saves but never records preview playback as History", async () => {
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
    expect(started.statusCode).toBe(409);
    expect(started.json()).toMatchObject({
      error: { code: "PLAYBACK_NOT_CONFIGURED" },
    });
    expect(history.json().items).toHaveLength(0);
  });

  it("never offers playback for a preview-only title", async () => {
    const result = await app().inject({
      method: "POST",
      url: "/api/v1/profiles/default/playback/start",
      payload: { titleId: "sai:preview:before-sunrise" },
    });

    expect(result.statusCode).toBe(409);
    expect(result.json()).toMatchObject({
      error: { code: "PLAYBACK_NOT_CONFIGURED" },
    });
  });

  it("does not create profiles as a side effect of read requests", async () => {
    const instance = app();
    for (let index = 1; index <= 7; index += 1) {
      const result = await instance.inject({
        method: "GET",
        url: `/api/v1/home?profileId=unknown-${index}`,
      });
      expect(result.statusCode).toBe(404);
      expect(result.json()).toMatchObject({
        error: { code: "PROFILE_NOT_FOUND" },
      });
    }

    const defaultProfile = await instance.inject({
      method: "GET",
      url: "/api/v1/home?profileId=default",
    });
    expect(defaultProfile.statusCode).toBe(200);
  });

  it("persists dynamically discovered provider titles in the canonical cache", async () => {
    const metadataProvenance = {
      providerId: "test-db",
      retrievedAt: "2026-09-27T12:00:00.000Z",
      connectorVersion: "1.0.0",
      confidence: 1,
      validationState: "verified" as const,
      expiresAt: null,
    };
    const availabilityProvenance = {
      ...metadataProvenance,
      providerId: "test-media",
    };
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
      ratings: [
        {
          source: "Test DB",
          value: 80,
          scale: 100,
          votes: 42,
          provenance: metadataProvenance,
        },
      ],
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
      metadataProvenance,
      availabilityProvenance,
      inLibrary: false,
      progressPercent: null,
    });
    const contentProvider: StreamerContentProvider = {
      id: "test-coordinator",
      mode: "live",
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
          mode: "live",
          stage: "completed",
          reply: "Validated by injected test providers.",
          bestMatch: { title: discoveredTitle, reason: "Best test match." },
          available: [],
          unavailable: [],
          unverified: [],
          warnings: [],
          completedAt,
        }),
      preparePlayback: async (_profileId, title) => ({
        grantId: "grant-dynamic",
        titleId: title.id,
        providerId: "test-media",
        variantId: "variant-1",
        url: "/api/v1/playback/grants/grant-dynamic",
        supportsHttpRange: true,
        expiresAt: "2026-09-27T12:05:00.000Z",
        embeddedSubtitles: [],
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
    const prepared = await instance.inject({
      method: "POST",
      url: "/api/v1/profiles/default/playback/prepare",
      payload: { titleId: "sai:test:dynamic-title" },
    });
    const historyBeforePlay = await instance.inject({
      method: "GET",
      url: "/api/v1/profiles/default/history",
    });
    const started = await instance.inject({
      method: "POST",
      url: "/api/v1/profiles/default/playback/start",
      payload: { titleId: "sai:test:dynamic-title" },
    });

    expect(discovery.statusCode).toBe(200);
    expect(saved.statusCode).toBe(200);
    expect(saved.json().items[0].title.id).toBe("sai:test:dynamic-title");
    expect(prepared.statusCode).toBe(200);
    expect(prepared.json().playback.titleId).toBe("sai:test:dynamic-title");
    expect(historyBeforePlay.json().items).toHaveLength(0);
    expect(started.statusCode).toBe(200);
    expect(started.json()).toMatchObject({
      playback: {
        titleId: "sai:test:dynamic-title",
        url: "/api/v1/playback/grants/grant-dynamic",
      },
      library: { items: [{ state: "in-progress" }] },
    });
  });
});
