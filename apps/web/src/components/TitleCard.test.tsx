import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_PLAYBACK_PREFERENCES } from "@streamer-ai/contracts";
import type { CatalogTitle } from "@streamer-ai/contracts";
import { describe, expect, it, vi } from "vitest";
import { TitleCard } from "./TitleCard";

const format = {
  label: "1080p",
  container: "mkv",
  resolution: "1080p",
  videoCodec: "H.264",
  audioLanguages: ["en"],
  subtitleLanguages: [],
};
const sources = ["first", "second"].map((candidateId, index) => ({
  id: String(index + 1).repeat(32),
  providerId: "webshare",
  candidateId,
  releaseName: `Example.2026.${index ? "720p" : "1080p"}.mkv`,
  sizeBytes: 100 + index,
  format: {
    ...format,
    resolution: index ? "720p" : "1080p",
    subtitleLanguages: index ? ["cs"] : [],
  },
  seasonNumber: null,
  episodeNumber: null,
  checkedAt: "2026-09-29T20:00:00.000Z",
}));
const movie: CatalogTitle = {
  id: "sai:tmdb:movie:42",
  kind: "movie",
  title: "Example",
  originalTitle: null,
  year: 2026,
  synopsis: "A movie.",
  posterUrl: null,
  backdropUrl: null,
  accentColor: "#334455",
  genres: [],
  ratings: [],
  matchPercent: null,
  availability: "available",
  availabilityProvider: "webshare",
  availabilityCheckedAt: "2026-09-29T20:00:00.000Z",
  formats: [format],
  sources,
  seriesCoverage: null,
  metadataProvider: "tmdb",
  metadataValidatedAt: "2026-09-29T20:00:00.000Z",
  inLibrary: false,
  progressPercent: null,
};

describe("TitleCard sources", () => {
  it("shows the source count without a source picker", async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    render(
      <TitleCard
        item={movie}
        preferences={DEFAULT_PLAYBACK_PREFERENCES}
        playbackCheck={{ status: "ready" }}
        onPlay={onPlay}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.getByText("2 sources")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "More sources for Example" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Play/i }));
    expect(onPlay).toHaveBeenLastCalledWith(movie);
  });
});
