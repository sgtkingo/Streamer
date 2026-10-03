import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { StreamerApi } from "./api/client";
import { DEFAULT_PLAYBACK_PREFERENCES } from "./playback-preferences";

function createApi(): StreamerApi {
  return {
    getSetupStatus: vi.fn().mockResolvedValue({
      complete: true,
      tmdb: "not-configured",
      webshare: "not-configured",
      localAi: "not-configured",
      playback: false,
    }),
    connectTmdb: vi.fn().mockResolvedValue({
      ok: true,
      integrationId: "tmdb",
      status: "connected",
      messageCode: "CONNECTED",
      persistence: "secure-local",
    }),
    connectWebshare: vi.fn().mockResolvedValue({
      ok: true,
      integrationId: "webshare",
      status: "connected",
      messageCode: "CONNECTED",
      persistence: "secure-local",
    }),
    detectLocalAi: vi.fn().mockResolvedValue({
      ok: true,
      message: "Ready",
      runtime: "Ollama",
      model: "qwen3.5:4b",
    }),
    getInferenceResidency: vi.fn().mockResolvedValue({
      state: "loaded",
      checkedAt: "2026-09-27T12:00:00.000Z",
    }),
    completeSetup: vi.fn().mockResolvedValue(undefined),
    getProfiles: vi.fn().mockResolvedValue({
      items: [
        {
          id: "default",
          name: "Alex",
          onboardingComplete: true,
          locale: "en",
          genres: ["Sci-fi"],
          prompt: "",
          playback: DEFAULT_PLAYBACK_PREFERENCES,
        },
      ],
      limit: 5,
    }),
    createProfile: vi.fn().mockResolvedValue({
      id: "profile-2",
      name: "Guest",
      onboardingComplete: false,
      locale: "en",
      genres: [],
      prompt: "",
      playback: DEFAULT_PLAYBACK_PREFERENCES,
    }),
    deleteProfile: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockImplementation(async (_profileId, patch) => ({
      id: "default",
      name: "Alex",
      onboardingComplete: true,
      locale: "en",
      genres: ["Sci-fi"],
      prompt: "",
      playback: DEFAULT_PLAYBACK_PREFERENCES,
      ...patch,
    })),
    getHome: vi.fn().mockResolvedValue({
      profileId: "default",
      mode: "preview",
      generatedAt: "2026-09-27T12:00:00.000Z",
      sections: [],
    }),
    getTitleDetail: vi.fn().mockImplementation(async (_profileId, titleId) => ({
      title: { id: titleId },
      series: null,
      related: [],
    })),
    discover: vi.fn().mockResolvedValue({
      sessionId: "session-1",
      mode: "preview",
      stage: "completed",
      reply: "Ready",
      bestMatch: null,
      available: [],
      unavailable: [],
      unverified: [],
      warnings: [],
      completedAt: "2026-09-27T12:00:00.000Z",
    }),
    getLibrary: vi.fn().mockResolvedValue({ profileId: "default", items: [] }),
    addToLibrary: vi
      .fn()
      .mockResolvedValue({ profileId: "default", items: [] }),
    removeFromLibrary: vi.fn().mockResolvedValue(undefined),
    getHistory: vi.fn().mockResolvedValue({ profileId: "default", items: [] }),
    removeHistoryEvent: vi.fn().mockResolvedValue(undefined),
    clearHistory: vi.fn().mockResolvedValue(undefined),
    startPlayback: vi.fn().mockResolvedValue({
      ok: true,
      eventId: "event-1",
      library: { profileId: "default", items: [] },
      playback: {
        grantId: "grant-1",
        titleId: "sai:title:lake-house",
        providerId: "test-media",
        variantId: "variant-1",
        url: "https://media.example/stream",
        supportsHttpRange: true,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        embeddedSubtitles: [],
      },
    }),
    preparePlayback: vi.fn().mockResolvedValue({
      ok: true,
      playback: {
        grantId: "grant-1",
        titleId: "sai:title:lake-house",
        providerId: "test-media",
        variantId: "variant-1",
        url: "/api/v1/playback/grants/grant-1",
        supportsHttpRange: true,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        embeddedSubtitles: [],
      },
    }),
    checkPlayback: vi.fn().mockResolvedValue({ ok: true }),
    getPlaybackManifest: vi.fn().mockResolvedValue({
      durationSeconds: 120,
      videoCodec: "h264",
      videoPixelFormat: "yuv420p",
      audioTracks: [],
      subtitleTracks: [],
    }),
    closePlayback: vi.fn().mockResolvedValue(undefined),
    savePlaybackProgress: vi.fn().mockResolvedValue(undefined),
  };
}

describe("onboarding", () => {
  it("opens setup directly for the first viewer", async () => {
    const api = createApi();
    vi.mocked(api.getSetupStatus).mockResolvedValue({
      complete: false,
      tmdb: "not-configured",
      webshare: "not-configured",
      localAi: "not-configured",
      playback: false,
    });
    render(<App api={api} />);
    expect(
      await screen.findByRole("heading", { name: /your cinema/i }),
    ).toBeInTheDocument();
    expect(api.getProfiles).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: /who's watching/i }),
    ).not.toBeInTheDocument();
  });

  it("opens setup if a completed installation has no viewer profiles", async () => {
    const api = createApi();
    vi.mocked(api.getProfiles).mockResolvedValue({ items: [], limit: 5 });
    render(<App api={api} />);
    expect(
      await screen.findByRole("heading", { name: /your cinema/i }),
    ).toBeInTheDocument();
  });

  it("guides a viewer through all five steps and opens the library", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<App api={api} forceOnboarding />);

    expect(
      screen.getByRole("heading", { name: /your cinema/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /start setup/i }));

    await user.type(screen.getByLabelText(/display name/i), "Alex");
    await user.click(screen.getByLabelText("Sci-fi"));
    expect(screen.getByLabelText("Primary audio language")).toHaveValue("cs");
    expect(screen.getByLabelText("Secondary audio language")).toHaveValue("en");
    expect(screen.getByLabelText("Subtitles with primary audio")).toHaveValue(
      "off",
    );
    expect(screen.getByLabelText("Subtitles with secondary audio")).toHaveValue(
      "cs",
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(
      screen.getByRole("heading", { name: /connect once/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^continue/i }));

    expect(
      screen.getByRole("heading", { name: /a curator/i }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("qwen3.5:4b")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /^continue/i }));

    expect(
      screen.getByRole("heading", { name: /welcome home, alex/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /enter streamer/i }));

    await user.click(await screen.findByRole("button", { name: /alex/i }));

    expect(
      await screen.findByRole("heading", {
        name: /what are you in the mood for/i,
      }),
    ).toBeInTheDocument();
    expect(api.completeSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          name: "Alex",
          preferences: ["Sci-fi"],
        }),
        localAiEnabled: true,
      }),
    );
  });

  it("clears a TMDB token after connecting and never renders it in status UI", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<App api={api} forceOnboarding />);

    await user.click(screen.getByRole("button", { name: /start setup/i }));
    await user.type(screen.getByLabelText(/display name/i), "Alex");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const secret = "secret-read-access-token-123";
    const tokenInput = screen.getByLabelText(/tmdb read access token/i);
    await user.type(tokenInput, secret);
    await user.click(
      screen.getByRole("button", { name: /verify and connect/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/connection verified/i)).toBeInTheDocument(),
    );
    expect(api.connectTmdb).toHaveBeenCalledWith(secret);
    expect(screen.queryByDisplayValue(secret)).not.toBeInTheDocument();
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("status")).queryByText(secret),
    ).not.toBeInTheDocument();
  });

  it("clears the Webshare password after local connection", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<App api={api} forceOnboarding />);

    await user.click(screen.getByRole("button", { name: /start setup/i }));
    await user.type(screen.getByLabelText(/display name/i), "Alex");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await user.type(screen.getByLabelText(/username or email/i), "viewer");
    const password = "webshare-password-sentinel";
    const passwordInput = screen.getByLabelText(/^password$/i);
    await user.type(passwordInput, password);
    expect(passwordInput).toHaveAttribute("type", "password");
    await user.click(
      screen.getByRole("button", { name: /show webshare password/i }),
    );
    expect(passwordInput).toHaveAttribute("type", "text");
    await user.click(
      screen.getByRole("button", { name: /hide webshare password/i }),
    );
    expect(passwordInput).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: /connect webshare/i }));

    expect(
      await screen.findByText(/session token is stored/i),
    ).toBeInTheDocument();
    expect(api.connectWebshare).toHaveBeenCalledWith("viewer", password);
    expect(screen.queryByDisplayValue(password)).not.toBeInTheDocument();
    expect(screen.queryByText(password)).not.toBeInTheDocument();
  });

  it("clearly identifies development-only memory storage", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.connectTmdb).mockResolvedValue({
      ok: true,
      integrationId: "tmdb",
      status: "connected",
      messageCode: "CONNECTED",
      persistence: "memory",
    });
    render(<App api={api} forceOnboarding />);

    await user.click(screen.getByRole("button", { name: /start setup/i }));
    await user.type(screen.getByLabelText(/display name/i), "Alex");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.type(
      screen.getByLabelText(/tmdb read access token/i),
      "development-token-long-enough",
    );
    await user.click(
      screen.getByRole("button", { name: /verify and connect/i }),
    );

    expect(await screen.findByText(/held in memory only/i)).toBeInTheDocument();
  });
});

describe("profile navigation", () => {
  it("opens profile pages, saves playback languages, and returns to the profile chooser", async () => {
    const user = userEvent.setup();
    const api = createApi();
    window.history.replaceState({}, "", "/");
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: /alex/i }));
    await user.click(
      screen.getByRole("button", { name: /profile menu for alex/i }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(
      screen.getByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Secondary audio language"),
      "de",
    );
    await user.click(screen.getByLabelText("Automatically find subtitles"));
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({
          playback: expect.objectContaining({
            secondaryAudioLanguage: "de",
            autoFindSubtitles: true,
          }),
        }),
      ),
    );
    await user.click(
      screen.getByRole("button", { name: /profile menu for alex/i }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Preferences" }));
    await user.type(
      screen.getByLabelText("Your taste prompt"),
      "Quiet autumn mysteries.",
    );
    await user.click(screen.getByRole("button", { name: "Save preferences" }));
    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({ prompt: "Quiet autumn mysteries." }),
      ),
    );
    await user.click(
      screen.getByRole("button", { name: /profile menu for alex/i }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: /log out \/ switch profile/i }),
    );
    expect(
      await screen.findByRole("heading", { name: /who's watching/i }),
    ).toBeInTheDocument();
  });

  it("creates a second viewer from one of five profile medallions", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const primary = (await api.getProfiles()).items[0]!;
    const guest = await api.createProfile({ name: "Guest", locale: "en" });
    vi.mocked(api.createProfile).mockClear();
    let created = false;
    let completed = false;
    vi.mocked(api.createProfile).mockImplementation(async () => {
      created = true;
      return guest;
    });
    vi.mocked(api.getProfiles).mockImplementation(async () => ({
      items: created
        ? [primary, { ...guest, onboardingComplete: completed }]
        : [primary],
      limit: 5,
    }));
    vi.mocked(api.completeSetup).mockImplementation(async (request) => {
      if (request.profileId === guest.id) completed = true;
    });
    render(<App api={api} />);
    await user.click(
      await screen.findByRole("button", { name: /add profile/i }),
    );
    await user.type(screen.getByLabelText("Profile name"), "Guest");
    await user.click(screen.getByRole("button", { name: "Create profile" }));
    await waitFor(() =>
      expect(api.createProfile).toHaveBeenCalledWith({
        name: "Guest",
        locale: "en",
      }),
    );
    expect(
      await screen.findByRole("button", { name: /start setup/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /profile menu for guest/i }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Exit setup" }));
    await user.click(
      await screen.findByRole("button", { name: /guest.*finish setup/i }),
    );
    await user.click(screen.getByRole("button", { name: /start setup/i }));
    expect(screen.getByLabelText("Display name")).toHaveValue("Guest");
    await user.click(screen.getByRole("button", { name: /^continue/i }));
    await user.click(screen.getByRole("button", { name: /^continue/i }));
    await user.click(screen.getByRole("button", { name: /^continue/i }));
    await user.click(screen.getByRole("button", { name: /enter streamer/i }));
    await waitFor(() =>
      expect(api.completeSetup).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: guest.id }),
      ),
    );
    expect(
      await screen.findByRole("button", { name: /profile menu for guest/i }),
    ).toBeInTheDocument();
  });

  it("reopens onboarding for the selected profile", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: /alex/i }));
    await user.click(
      screen.getByRole("button", { name: /profile menu for alex/i }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));
    await user.click(
      screen.getByRole("button", { name: "Run onboarding again" }),
    );
    await user.click(screen.getByRole("button", { name: /start setup/i }));
    expect(screen.getByLabelText("Display name")).toHaveValue("Alex");
    expect(screen.getByLabelText("Primary audio language")).toHaveValue("cs");
    await user.click(screen.getByRole("button", { name: /^continue/i }));
    await user.click(screen.getByRole("button", { name: /^continue/i }));
    await user.click(screen.getByRole("button", { name: /^continue/i }));
    await user.click(screen.getByRole("button", { name: /enter streamer/i }));
    await waitFor(() =>
      expect(api.completeSetup).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: "default" }),
      ),
    );
  });
});

describe("conversational Home", () => {
  const title = {
    id: "sai:title:lake-house",
    kind: "movie" as const,
    title: "The Lake House",
    originalTitle: null,
    year: 2006,
    synopsis: "A lakeside mailbox bridges two years.",
    posterUrl: null,
    backdropUrl: null,
    accentColor: "#6b4a3f",
    genres: ["Romance"],
    ratings: [{ source: "TMDB", value: 7.2, scale: 10, votes: 1200 }],
    matchPercent: 94,
    availability: "available" as const,
    availabilityProvider: "media-fixture",
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
    metadataProvider: "metadata-fixture",
    metadataValidatedAt: "2026-09-27T12:00:00.000Z",
    inLibrary: false,
    progressPercent: null,
  };

  it("opens the same detail view from a movie tile", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.getHome).mockResolvedValue({
      profileId: "default",
      mode: "preview",
      generatedAt: "2026-09-27T12:00:00.000Z",
      sections: [
        {
          id: "for-you",
          title: "Picks For You",
          subtitle: "Starting point",
          freshness: "fresh",
          items: [title],
        },
      ],
    });
    vi.mocked(api.getTitleDetail).mockResolvedValue({
      title,
      series: null,
      related: [],
    });
    window.history.replaceState({}, "", "/");
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: /alex/i }));
    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "Details for The Lake House",
        })
      )[0]!,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Details for The Lake House",
    });
    expect(
      within(dialog).getByRole("heading", { name: "The Lake House" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "More to watch" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("heading", { name: "Seasons & episodes" }),
    ).not.toBeInTheDocument();
  });

  it("returns from a series episode to the same season and shows its name in the player", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const show = {
      ...title,
      id: "sai:title:sample-show",
      kind: "series" as const,
      title: "Sample Show",
      seriesCoverage: {
        seasonsAvailable: 2,
        seasonsTotal: 2,
        episodesAvailable: 2,
        episodesTotal: 2,
        complete: true,
        nextEpisodeLabel: "S01 E01",
      },
    };
    vi.mocked(api.getSetupStatus).mockResolvedValue({
      complete: true,
      tmdb: "connected",
      webshare: "connected",
      localAi: "connected",
      playback: true,
    });
    vi.mocked(api.getHome).mockResolvedValue({
      profileId: "default",
      mode: "live",
      generatedAt: "2026-09-27T12:00:00.000Z",
      sections: [
        {
          id: "for-you",
          title: "Picks For You",
          subtitle: "Starting point",
          freshness: "fresh",
          items: [show],
        },
      ],
    });
    vi.mocked(api.getTitleDetail).mockResolvedValue({
      title: show,
      related: [],
      series: {
        status: "complete",
        seasons: [
          {
            seasonNumber: 1,
            title: "Season One",
            episodes: [
              {
                seasonNumber: 1,
                episodeNumber: 1,
                title: "Pilot",
                airDate: null,
                availability: "available",
              },
            ],
          },
          {
            seasonNumber: 2,
            title: "Season Two",
            episodes: [
              {
                seasonNumber: 2,
                episodeNumber: 3,
                title: "Third Episode",
                airDate: null,
                availability: "available",
              },
            ],
          },
        ],
      },
    });
    window.history.replaceState({}, "", "/");
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: /alex/i }));
    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "Details for Sample Show",
        })
      )[0]!,
    );
    const details = await screen.findByRole("dialog", {
      name: "Details for Sample Show",
    });
    await within(details).findByText(/Pilot/);
    await user.click(within(details).getByRole("button", { name: "Season 2" }));
    details.scrollTop = 180;
    await user.click(within(details).getByRole("button", { name: /play/i }));

    const player = await screen.findByRole("dialog", {
      name: /playing sample show/i,
    });
    expect(
      within(player).getByRole("heading", {
        name: /Sample Show.*S02E03.*Third Episode/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Details for Sample Show" }),
    ).not.toBeInTheDocument();
    expect(api.preparePlayback).toHaveBeenCalledWith("default", show.id, {
      seasonNumber: 2,
      episodeNumber: 3,
    });

    await user.click(
      within(player).getByRole("button", { name: "Close player" }),
    );
    const returned = await screen.findByRole("dialog", {
      name: "Details for Sample Show",
    });
    expect(
      within(returned).getByRole("button", { name: "Season 2" }),
    ).toHaveClass("is-active");
    expect(within(returned).getByText(/Third Episode/)).toBeInTheDocument();
    expect(returned).toHaveProperty("scrollTop", 180);
    await waitFor(() => expect(api.getTitleDetail).toHaveBeenCalledTimes(2));

    await user.click(
      within(returned).getByRole("button", { name: "Close details" }),
    );
    await user.click(await screen.findByRole("button", { name: /^▶ Play$/ }));
    const quickPlayer = await screen.findByRole("dialog", {
      name: /playing sample show/i,
    });
    expect(
      await within(quickPlayer).findByRole("heading", {
        name: /Sample Show.*S01E01.*Pilot/,
      }),
    ).toBeInTheDocument();
  });

  it("submits a natural-language request and renders the validated best match actions", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.getHome).mockResolvedValue({
      profileId: "default",
      mode: "preview",
      generatedAt: "2026-09-27T12:00:00.000Z",
      sections: [
        {
          id: "for-you",
          title: "Picks for You",
          subtitle: "Starting point",
          freshness: "fresh",
          items: [title],
        },
      ],
    });
    vi.mocked(api.discover).mockResolvedValue({
      sessionId: "session-1",
      mode: "live",
      stage: "completed",
      reply: "A warm seasonal match.",
      bestMatch: { title, reason: "Requested actor and autumn mood." },
      available: [],
      unavailable: [],
      unverified: [],
      warnings: [],
      completedAt: "2026-09-27T12:00:00.000Z",
    });
    window.history.replaceState({}, "", "/");
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: /alex/i }));

    await user.type(
      await screen.findByLabelText(/ask streamerai/i),
      "an autumn movie with Sandra Bullock",
    );
    await user.click(screen.getByRole("button", { name: /find something/i }));

    expect(
      await screen.findByText("Requested actor and autumn mood."),
    ).toBeInTheDocument();
    const results = screen.getByRole("region", {
      name: /a considered shortlist/i,
    });
    expect(
      within(results).getByRole("button", {
        name: /play/i,
      }),
    ).toBeInTheDocument();
    await user.click(
      within(results).getByRole("button", { name: /add to library/i }),
    );
    expect(api.addToLibrary).toHaveBeenCalledWith("default", title.id);
  });

  it("shows a wake-up notice only when the live local model is not resident", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.getHome).mockResolvedValue({
      profileId: "default",
      mode: "live",
      generatedAt: "2026-09-27T12:00:00.000Z",
      sections: [],
    });
    vi.mocked(api.getInferenceResidency).mockResolvedValue({
      state: "unloaded",
      checkedAt: "2026-09-27T12:00:00.000Z",
    });
    let resolveDiscovery:
      | ((value: Awaited<ReturnType<StreamerApi["discover"]>>) => void)
      | undefined;
    vi.mocked(api.discover).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDiscovery = resolve;
        }),
    );
    window.history.replaceState({}, "", "/");
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: /alex/i }));
    await screen.findByRole("heading", {
      name: /what are you in the mood for/i,
    });
    await waitFor(() => expect(api.getHome).toHaveBeenCalled());
    await user.type(
      screen.getByLabelText(/ask streamerai/i),
      "an autumn movie",
    );
    await user.click(screen.getByRole("button", { name: "Find something" }));

    expect(
      await screen.findByText(/local agent dozed off/i, {
        selector: ".agent-wake-notice",
      }),
    ).toBeInTheDocument();
    expect(api.getInferenceResidency).toHaveBeenCalledWith(
      expect.any(AbortSignal),
      true,
    );
    await new Promise((resolve) => setTimeout(resolve, 800));
    const progress = screen.getByRole("region", { name: "Discovery progress" });
    expect(
      within(progress).getByText("Ranking verified matches"),
    ).not.toHaveClass("is-active");

    resolveDiscovery?.({
      sessionId: "cold-session",
      mode: "live",
      stage: "completed",
      reply: "Found a match.",
      bestMatch: null,
      available: [],
      unavailable: [],
      unverified: [],
      warnings: [],
      completedAt: "2026-09-27T12:00:00.000Z",
    });
    expect(
      await screen.findByRole("region", { name: /a considered shortlist/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/local agent dozed off/i, {
        selector: ".agent-wake-notice",
      }),
    ).not.toBeInTheDocument();
  });

  it("stops discovery and ignores a response that arrives after cancellation", async () => {
    const user = userEvent.setup();
    const api = createApi();
    let resolveDiscovery:
      | ((value: Awaited<ReturnType<StreamerApi["discover"]>>) => void)
      | undefined;
    vi.mocked(api.discover).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDiscovery = resolve;
        }),
    );
    window.history.replaceState({}, "", "/");
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: /alex/i }));
    await user.type(
      screen.getByLabelText(/ask streamerai/i),
      "a gentle comedy",
    );
    await user.click(screen.getByRole("button", { name: "Find something" }));

    const stop = screen.getByRole("button", { name: "Stop search" });
    expect(stop).toHaveClass("is-searching");
    expect(
      screen.getByRole("region", { name: "Discovery progress" }),
    ).toBeInTheDocument();
    const signal = vi.mocked(api.discover).mock.calls[0]?.[1];
    expect(signal?.aborted).toBe(false);
    await user.click(stop);
    expect(signal?.aborted).toBe(true);
    expect(
      screen.getByRole("button", { name: "Find something" }),
    ).toBeEnabled();

    resolveDiscovery?.({
      sessionId: "late-session",
      mode: "live",
      stage: "completed",
      reply: "This result should be discarded.",
      bestMatch: { title, reason: "Late result" },
      available: [],
      unavailable: [],
      unverified: [],
      warnings: [],
      completedAt: "2026-09-27T12:00:00.000Z",
    });
    await waitFor(() => {
      expect(
        screen.queryByText("This result should be discarded."),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: "Discovery progress" }),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Find something" }));
    await waitFor(() => expect(api.discover).toHaveBeenCalledTimes(2));
    expect(
      vi.mocked(api.discover).mock.calls[1]?.[0].sessionId,
    ).toBeUndefined();
  });

  it("automatically checks a live title and enables Play when verified", async () => {
    const user = userEvent.setup();
    const api = createApi();
    let resolveCheck!: () => void;
    vi.mocked(api.checkPlayback).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = () =>
            resolve({
              ok: true,
              audioLanguages: ["jpn"],
              subtitleLanguages: [],
            });
        }),
    );
    vi.mocked(api.discover).mockResolvedValue({
      sessionId: "session-check",
      mode: "live",
      stage: "completed",
      reply: "A verified match.",
      bestMatch: { title, reason: "A good fit." },
      available: [],
      unavailable: [],
      unverified: [],
      warnings: [],
      completedAt: "2026-09-27T12:00:00.000Z",
    });
    render(
      <StrictMode>
        <App api={api} />
      </StrictMode>,
    );

    await user.click(await screen.findByRole("button", { name: /alex/i }));

    await user.type(
      await screen.findByLabelText(/ask streamerai/i),
      "a warm romantic movie",
    );
    await user.click(screen.getByRole("button", { name: /find something/i }));
    await waitFor(() =>
      expect(api.checkPlayback).toHaveBeenCalledWith(
        "default",
        title.id,
        undefined,
      ),
    );
    const checking = screen.getByRole("button", { name: /checking/i });
    expect(checking).toBeDisabled();
    expect(checking).toHaveClass("button--checking");
    resolveCheck();
    const play = await screen.findByRole("button", { name: /play/i });
    expect(play).toBeEnabled();
    expect(screen.getByText("JAP (!)")).toBeInTheDocument();
    await user.click(play);
    expect(
      await screen.findByRole("dialog", { name: /playing the lake house/i }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("button", { name: "StreamerAI home" }),
      ).getByLabelText("StreamerAI"),
    ).toHaveTextContent("STREAMERAI");
    expect(
      within(
        screen.getByRole("dialog", { name: /playing the lake house/i }),
      ).getByLabelText("StreamerAI"),
    ).toHaveTextContent("STREAMERAI");
    expect(api.getPlaybackManifest).toHaveBeenCalledWith("grant-1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.closePlayback).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /close player/i }));
    await waitFor(() =>
      expect(api.closePlayback).toHaveBeenCalledWith("grant-1"),
    );
  });
});
