import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CatalogTitle } from "@streamer-ai/contracts";
import type { StreamerApi } from "../api/client";
import { usePlaybackChecks } from "./usePlaybackChecks";

describe("usePlaybackChecks", () => {
  it("checks each selected series episode separately", async () => {
    const api = {
      checkPlayback: vi.fn().mockResolvedValue({
        ok: true,
        audioLanguages: ["jpn"],
        subtitleLanguages: ["cs"],
      }),
    } as unknown as StreamerApi;
    const first = {
      id: "series-1",
      kind: "series",
      resumeEpisode: { seasonNumber: 1, episodeNumber: 1 },
    } as CatalogTitle;
    const next = {
      ...first,
      resumeEpisode: { seasonNumber: 2, episodeNumber: 3 },
    } as CatalogTitle;
    const { result } = renderHook(() => usePlaybackChecks(api, "profile-1"));

    act(() => result.current.check(first, first.resumeEpisode ?? undefined));
    await waitFor(() =>
      expect(result.current.stateFor(first)).toMatchObject({ status: "ready" }),
    );
    expect(result.current.stateFor(next)).toBeUndefined();

    act(() => result.current.check(next, next.resumeEpisode ?? undefined));
    await waitFor(() =>
      expect(result.current.stateFor(next)).toMatchObject({
        status: "ready",
        audioLanguages: ["jpn"],
        subtitleLanguages: ["cs"],
      }),
    );
    expect(api.checkPlayback).toHaveBeenCalledTimes(2);
    expect(api.checkPlayback).toHaveBeenLastCalledWith(
      "profile-1",
      "series-1",
      { seasonNumber: 2, episodeNumber: 3 },
    );
  });
});
