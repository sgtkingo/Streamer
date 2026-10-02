import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PLAYBACK_PREFERENCES } from "@streamer-ai/contracts";
import { createApp } from "../src/index.js";

describe("viewer profiles", () => {
  const apps: ReturnType<typeof createApp>[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("creates at most five profiles and keeps playback preferences per viewer", async () => {
    const app = createApp({ environment: "test", logger: false });
    apps.push(app);
    const first = await app.inject({ method: "GET", url: "/api/v1/profiles" });
    expect(first.statusCode).toBe(200);
    expect(first.json().items).toHaveLength(1);
    expect(first.json().items[0].id).toBe("default");

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/profiles",
      payload: { name: "Alex", locale: "cs" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().onboardingComplete).toBe(false);
    const id = created.json().id as string;
    const playback = {
      ...DEFAULT_PLAYBACK_PREFERENCES,
      autoFindSubtitles: true,
      primaryAudioLanguage: "en",
      secondaryAudioSubtitleLanguage: "en",
    };
    const updated = await app.inject({
      method: "PATCH",
      url: `/api/v1/profiles/${id}`,
      payload: {
        genres: ["Drama"],
        prompt: "Quiet autumn films with rich dialogue.",
        playback,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      name: "Alex",
      genres: ["Drama"],
      prompt: "Quiet autumn films with rich dialogue.",
      playback,
    });

    const defaultProfile = (
      await app.inject({ method: "GET", url: "/api/v1/profiles" })
    )
      .json()
      .items.find((item: { id: string }) => item.id === "default");
    expect(defaultProfile.playback.autoFindSubtitles).toBe(false);
    const home = await app.inject({
      method: "GET",
      url: `/api/v1/home?profileId=${id}`,
    });
    expect(home.statusCode).toBe(200);
    const titleId = home
      .json()
      .sections.flatMap(
        (section: { items: Array<{ id: string }> }) => section.items,
      )[0].id as string;
    const saved = await app.inject({
      method: "PUT",
      url: `/api/v1/profiles/${id}/library/${encodeURIComponent(titleId)}`,
    });
    expect(saved.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/profiles/default/library",
        })
      ).json().items,
    ).toHaveLength(0);

    for (const name of ["B", "C", "D"]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/profiles",
            payload: { name },
          })
        ).statusCode,
      ).toBe(201);
    }
    const sixth = await app.inject({
      method: "POST",
      url: "/api/v1/profiles",
      payload: { name: "Too many" },
    });
    expect(sixth.statusCode).toBe(409);
    expect(sixth.json().error.code).toBe("PROFILE_LIMIT_REACHED");
  });

  it("revisits onboarding for a selected profile without erasing its taste prompt", async () => {
    const app = createApp({ environment: "test", logger: false });
    apps.push(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/profiles",
      payload: { name: "Alex" },
    });
    const id = created.json().id as string;
    await app.inject({
      method: "PATCH",
      url: `/api/v1/profiles/${id}`,
      payload: { prompt: "Slow cinema." },
    });
    const setup = await app.inject({
      method: "POST",
      url: "/api/v1/setup/complete",
      payload: {
        profileId: id,
        localAiEnabled: false,
        profile: {
          name: "Alex 2",
          locale: "cs",
          preferences: ["Drama"],
          playback: DEFAULT_PLAYBACK_PREFERENCES,
        },
      },
    });
    expect(setup.statusCode).toBe(204);
    const profiles = (
      await app.inject({ method: "GET", url: "/api/v1/profiles" })
    ).json().items;
    expect(
      profiles.find((item: { id: string }) => item.id === id),
    ).toMatchObject({
      name: "Alex 2",
      onboardingComplete: true,
      prompt: "Slow cinema.",
      genres: ["Drama"],
    });
  });
});
