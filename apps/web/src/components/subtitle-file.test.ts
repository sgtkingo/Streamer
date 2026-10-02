import { describe, expect, it } from "vitest";
import { subtitleFileToVtt } from "./subtitle-file";

describe("local subtitle files", () => {
  it("converts SRT cue times to WebVTT", () => {
    expect(
      subtitleFileToVtt(
        "movie.srt",
        "1\r\n00:00:01,250 --> 00:00:03,000\r\nHello!\r\n",
      ),
    ).toContain("00:00:01.250 --> 00:00:03.000");
  });

  it("keeps commas in ASS dialogue and strips styling tags", () => {
    const ass =
      "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,{\\i1}Hello, world\\NAgain";
    const vtt = subtitleFileToVtt("movie.ass", ass);
    expect(vtt).toContain("00:00:01.000 --> 00:00:02.500");
    expect(vtt).toContain("Hello, world\nAgain");
  });
});
