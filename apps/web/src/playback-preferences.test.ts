import { describe, expect, it } from "vitest";
import type { PlaybackMediaInfo } from "@streamer-ai/contracts";
import {
  DEFAULT_PLAYBACK_PREFERENCES,
  preferredAudioTrack,
  preferredEmbeddedSubtitle,
} from "./playback-preferences";

const media: PlaybackMediaInfo = {
  durationSeconds: 120,
  videoCodec: "h264",
  videoPixelFormat: "yuv420p",
  audioTracks: [
    {
      streamIndex: 1,
      codec: "aac",
      channels: 2,
      channelLayout: "stereo",
      language: "eng",
      title: null,
    },
    {
      streamIndex: 2,
      codec: "eac3",
      channels: 6,
      channelLayout: "5.1",
      language: "ces",
      title: null,
    },
  ],
  subtitleTracks: [
    { streamIndex: 3, codec: "subrip", language: "cze", title: null },
  ],
};

describe("profile playback preferences", () => {
  it("prefers Czech audio even when English is the first track", () => {
    const audio = preferredAudioTrack(media, DEFAULT_PLAYBACK_PREFERENCES);
    expect(audio?.streamIndex).toBe(2);
    expect(
      preferredEmbeddedSubtitle(media, DEFAULT_PLAYBACK_PREFERENCES, audio),
    ).toBe("off");
  });

  it("uses Czech subtitles for secondary English audio when enabled", () => {
    const preferences = {
      ...DEFAULT_PLAYBACK_PREFERENCES,
      autoFindSubtitles: true,
    };
    const englishOnly = { ...media, audioTracks: [media.audioTracks[0]!] };
    const audio = preferredAudioTrack(englishOnly, preferences);
    expect(audio?.streamIndex).toBe(1);
    expect(preferredEmbeddedSubtitle(englishOnly, preferences, audio)).toBe(
      "embedded:3",
    );
  });
});
