import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { StreamerApi } from "./api/client";

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
    completeSetup: vi.fn().mockResolvedValue(undefined),
    getHome: vi.fn().mockResolvedValue({
      profileId: "default",
      mode: "preview",
      generatedAt: "2026-09-27T12:00:00.000Z",
      sections: [],
    }),
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
        expiresAt: "2026-09-27T12:05:00.000Z",
        embeddedSubtitles: [],
      },
    }),
  };
}

describe("onboarding", () => {
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
    await user.type(screen.getByLabelText(/^password$/i), password);
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
      within(results).getByRole("button", { name: /check & play/i }),
    ).toBeInTheDocument();
    await user.click(
      within(results).getByRole("button", { name: /add to library/i }),
    );
    expect(api.addToLibrary).toHaveBeenCalledWith("default", title.id);
  });
});
