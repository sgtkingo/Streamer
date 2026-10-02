import { describe, expect, it } from "vitest";
import { createApp, InMemoryPlaybackTicketStore } from "../src/index.js";

describe("ephemeral playback tickets", () => {
  it("keeps exactly one direct URL in memory and redirects without caching", async () => {
    const now = () => new Date("2026-09-28T12:00:00.000Z");
    const store = new InMemoryPlaybackTicketStore(now);
    const firstPath = store.issue({
      grantId: "grant-one",
      profileId: "default",
      providerId: "webshare",
      titleId: "title-1",
      variantId: "file-1",
      directUrl: "https://cdn.webshare.cz/first",
      expiresAt: "2026-09-28T12:01:00.000Z",
    });
    const secondPath = store.issue({
      grantId: "grant-two",
      profileId: "default",
      providerId: "webshare",
      titleId: "sai:preview:lake-house",
      variantId: "file-2",
      directUrl: "https://cdn.webshare.cz/second",
      expiresAt: "2026-09-28T12:01:00.000Z",
    });
    expect(store.get("grant-one")).toBeNull();
    expect(firstPath).toBe("/api/v1/playback/grants/grant-one");

    const app = createApp({
      environment: "test",
      logger: false,
      now,
      playbackTicketStore: store,
    });
    const redirect = await app.inject({ method: "GET", url: secondPath });
    expect(redirect.statusCode).toBe(302);
    expect(redirect.headers.location).toBe("https://cdn.webshare.cz/second");
    expect(redirect.headers["cache-control"]).toContain("no-store");
    expect(redirect.headers["referrer-policy"]).toBe("no-referrer");
    const history = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/default/history",
    });
    expect(history.json().items).toHaveLength(1);
    await app.inject({ method: "GET", url: secondPath });
    const historyAfterReload = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/default/history",
    });
    expect(historyAfterReload.json().items).toHaveLength(1);
    await app.close();
  });
});
