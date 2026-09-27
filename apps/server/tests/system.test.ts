import { afterEach, describe, expect, it } from "vitest";
import { createApp, type FetchLike } from "../src/index.js";

const unusedFetch: FetchLike = async () => {
  throw new Error("TMDB fetch should not run in a system-route test");
};

describe("system API", () => {
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

  it("reports liveness and readiness", async () => {
    const instance = app();
    const live = await instance.inject({
      method: "GET",
      url: "/api/v1/health/live",
    });
    const ready = await instance.inject({
      method: "GET",
      url: "/api/v1/health/ready",
    });

    expect(live.statusCode).toBe(200);
    expect(live.json()).toMatchObject({ status: "ok" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: "ready" });
  });

  it("makes non-persistent development storage explicit", async () => {
    const instance = app();
    const setup = await instance.inject({
      method: "GET",
      url: "/api/v1/setup/status",
    });
    const integrations = await instance.inject({
      method: "GET",
      url: "/api/v1/integrations",
    });

    expect(setup.json()).toMatchObject({
      status: "needs_setup",
      storage: { persistence: "memory", durable: false },
    });
    expect(integrations.json()).toMatchObject({
      persistence: "memory",
      items: [{ id: "tmdb", status: "not_configured" }],
    });
  });

  it("refuses memory stores in production composition", () => {
    expect(() =>
      createApp({ environment: "production", logger: false, fetch: unusedFetch }),
    ).toThrow(/persistent SecretStore/);
  });
});
