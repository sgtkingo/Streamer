import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const filename = resolve(process.argv[2] ?? ".secrets/streamerai_master_key");
await mkdir(dirname(filename), { recursive: true });
try {
  await writeFile(filename, `${randomBytes(32).toString("base64")}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(`Created StreamerAI master key at ${filename}\n`);
} catch (error) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  ) {
    process.stderr.write(
      `Refusing to replace the existing master key at ${filename}\n`,
    );
    process.exitCode = 1;
  } else {
    throw error;
  }
}
