import type { TitleSource } from "@streamer-ai/contracts";

/** Human-readable hints only; playback rechecks the selected file. */
export function sourceLabel(source: TitleSource): string {
  const quality = source.format.resolution ?? "Quality unknown";
  const audio = source.format.audioLanguages.length
    ? source.format.audioLanguages
        .map((language) => language.toUpperCase())
        .join(" / ")
    : "Audio to verify";
  const subtitles = source.format.subtitleLanguages.length
    ? ` · Sub ${source.format.subtitleLanguages.map((language) => language.toUpperCase()).join(" / ")}`
    : "";
  return `${quality} · ${audio}${subtitles}`;
}
