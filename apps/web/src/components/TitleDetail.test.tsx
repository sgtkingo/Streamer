import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  CatalogTitle,
  TitleDetail as Detail,
} from "@streamer-ai/contracts";
import type { StreamerApi } from "../api/client";
import { TitleDetail } from "./TitleDetail";

const title = {
  id: "sai:tmdb:series:42",
  kind: "series",
  title: "Sample Show",
  originalTitle: null,
  year: 2021,
  synopsis: "A mystery unfolds.",
  accentColor: "#664466",
  genres: ["Mystery"],
  ratings: [],
  matchPercent: null,
  availability: "partial",
  availabilityProvider: "webshare",
  availabilityCheckedAt: "2026-09-29T20:00:00.000Z",
  formats: [
    {
      label: "1080p",
      container: "mkv",
      resolution: "1080p",
      videoCodec: "H.264",
      audioLanguages: ["en"],
      subtitleLanguages: [],
    },
  ],
  seriesCoverage: {
    seasonsAvailable: 1,
    seasonsTotal: 1,
    episodesAvailable: 1,
    episodesTotal: 2,
    complete: false,
    nextEpisodeLabel: "S01 E01",
  },
  metadataProvider: "tmdb",
  metadataValidatedAt: "2026-09-29T20:00:00.000Z",
  backdropUrl: null,
  posterUrl: null,
  inLibrary: false,
  progressPercent: null,
} satisfies CatalogTitle;

describe("TitleDetail", () => {
  it("lets a verified episode play while later episodes are still searching", async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn().mockResolvedValue(undefined);
    const detail = {
      title,
      related: [],
      series: {
        status: "searching",
        seasons: [
          {
            seasonNumber: 1,
            title: "Season One",
            episodes: [
              {
                seasonNumber: 1,
                episodeNumber: 1,
                title: "Pilot",
                airDate: "2021-01-01",
                availability: "available",
              },
              {
                seasonNumber: 1,
                episodeNumber: 2,
                title: "Next",
                airDate: "2021-01-08",
                availability: "searching",
              },
            ],
          },
        ],
      },
    } as Detail;
    const api = {
      getTitleDetail: vi.fn().mockResolvedValue(detail),
    } as unknown as StreamerApi;
    render(
      <TitleDetail
        api={api}
        profileId="default"
        title={title}
        playbackEnabled
        onClose={vi.fn()}
        onOpenRelated={vi.fn()}
        onPlay={onPlay}
        onAdded={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Details for Sample Show",
    });
    expect(await within(dialog).findByText(/Pilot/)).toBeInTheDocument();
    expect(
      within(dialog).getAllByText("• searching...").length,
    ).toBeGreaterThan(0);
    const readyEpisode = within(dialog).getByText(/Pilot/).closest("li")!;
    const pendingEpisode = within(dialog).getByText(/Next/).closest("li")!;
    expect(
      within(readyEpisode).getByRole("button", { name: /play/i }),
    ).toBeEnabled();
    expect(
      within(pendingEpisode).queryByRole("button", { name: /play/i }),
    ).not.toBeInTheDocument();
    await user.click(
      within(readyEpisode).getByRole("button", { name: /play/i }),
    );
    expect(onPlay).toHaveBeenCalledWith(
      title,
      {
        seasonNumber: 1,
        episodeNumber: 1,
      },
      "Pilot",
    );
  });
});
