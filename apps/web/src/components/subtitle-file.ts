function assTime(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2}):(\d{2})\.(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return `${match[1]?.padStart(2, "0")}:${match[2]}:${match[3]}.${match[4]}0`;
}

/** Converts a local text subtitle file into a browser WebVTT track. */
export function subtitleFileToVtt(filename: string, content: string): string {
  const text = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (/^WEBVTT(?:\s|$)/.test(text)) return text;

  if (/\.(?:ass|ssa)$/i.test(filename) || /^\[Script Info\]/m.test(text)) {
    const lines = text.split("\n");
    let inEvents = false;
    let fields: string[] = [];
    const cues: string[] = [];
    for (const line of lines) {
      if (/^\[Events\]/i.test(line.trim())) {
        inEvents = true;
        continue;
      }
      if (inEvents && /^\[/.test(line.trim())) inEvents = false;
      if (!inEvents) continue;
      if (/^Format:/i.test(line)) {
        fields = line
          .slice(line.indexOf(":") + 1)
          .split(",")
          .map((field) => field.trim().toLowerCase());
      }
      if (!/^Dialogue:/i.test(line) || fields.length === 0) continue;
      const rawParts = line.slice(line.indexOf(":") + 1).split(",");
      const parts = [
        ...rawParts.slice(0, fields.length - 1),
        rawParts.slice(fields.length - 1).join(","),
      ];
      const start = assTime(parts[fields.indexOf("start")] ?? "");
      const end = assTime(parts[fields.indexOf("end")] ?? "");
      const caption = parts[fields.indexOf("text")]
        ?.replace(/\{[^}]*\}/g, "")
        .replace(/\\N/g, "\n")
        .replace(/\\h/g, " ")
        .trim();
      if (start && end && caption) cues.push(`${start} --> ${end}\n${caption}`);
    }
    if (cues.length === 0)
      throw new Error("No readable subtitle cues were found.");
    return `WEBVTT\n\n${cues.join("\n\n")}\n`;
  }

  if (!/\d{2}:\d{2}[,.:]\d{3}\s*-->\s*\d{2}:\d{2}/.test(text)) {
    throw new Error("Choose an SRT, VTT, ASS or SSA subtitle file.");
  }
  return `WEBVTT\n\n${text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2").trim()}\n`;
}
