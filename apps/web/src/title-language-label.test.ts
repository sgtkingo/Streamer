import { describe, expect, it } from "vitest";
import type { CatalogTitle, MediaFormat } from "@streamer-ai/contracts";
import { DEFAULT_PLAYBACK_PREFERENCES } from "./playback-preferences";
import { titleLanguageLabel } from "./title-language-label";

function format(
  audioLanguages: string[],
  subtitleLanguages: string[],
): MediaFormat {
  return {
    label: "1080p",
    container: "mkv",
    resolution: "1080p",
    videoCodec: "H.264",
    audioLanguages,
    subtitleLanguages,
  };
}

function title(...formats: MediaFormat[]): CatalogTitle {
  return { formats } as CatalogTitle;
}

describe("titleLanguageLabel", () => {
  const examples = [
    {
      audio: ["ces", "eng"],
      subtitles: ["cs"],
      text: "CZ, ENG (sub)",
      warning: false,
    },
    { audio: ["eng"], subtitles: ["cs"], text: "ENG (sub)", warning: false },
    { audio: ["eng"], subtitles: [], text: "ENG", warning: false },
    { audio: ["jpn"], subtitles: ["cs"], text: "JAP (sub)", warning: false },
    { audio: ["jpn"], subtitles: [], text: "JAP (!)", warning: true },
  ];

  for (const example of examples) {
    it(`labels ${example.audio.join("+")} with ${example.subtitles.length} subtitles`, () => {
      expect(
        titleLanguageLabel(
          title(format(example.audio, example.subtitles)),
          DEFAULT_PLAYBACK_PREFERENCES,
        ),
      ).toEqual({ text: example.text, warning: example.warning });
    });
  }

  it("orders languages according to the current profile", () => {
    expect(
      titleLanguageLabel(title(format(["cs", "de", "en"], ["fr"])), {
        ...DEFAULT_PLAYBACK_PREFERENCES,
        primaryAudioLanguage: "de",
        secondaryAudioLanguage: "cs",
      }),
    ).toEqual({ text: "DE, CZ (sub)", warning: false });
  });

  it("uses the checked media tracks instead of release-name guesses", () => {
    expect(
      titleLanguageLabel(
        title(format(["en"], [])),
        DEFAULT_PLAYBACK_PREFERENCES,
        { audioLanguages: ["ja"], subtitleLanguages: ["und"] },
      ),
    ).toEqual({ text: "JAP (sub)", warning: false });
  });

  it("does not attribute one variant's subtitles to another", () => {
    expect(
      titleLanguageLabel(
        title(format(["en"], []), format(["ja"], ["cs"])),
        DEFAULT_PLAYBACK_PREFERENCES,
      ),
    ).toEqual({ text: "ENG", warning: false });
  });
});
