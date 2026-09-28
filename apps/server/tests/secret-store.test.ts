import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EncryptedFileSecretStore } from "../src/index.js";

describe("encrypted file secret store", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      directories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  async function fixture() {
    const directory = await mkdtemp(join(tmpdir(), "streamer-ai-vault-"));
    directories.push(directory);
    const keyFilename = join(directory, "master.key");
    const filename = join(directory, "data", "secrets.vault");
    await writeFile(keyFilename, randomBytes(32).toString("base64"), {
      mode: 0o600,
    });
    return { directory, keyFilename, filename };
  }

  it("persists encrypted values and reloads them", async () => {
    const paths = await fixture();
    const first = new EncryptedFileSecretStore(paths);

    expect(await first.isReady()).toBe(true);
    await first.set("tmdb.read-token", "secret-token-value");
    expect(await first.get("tmdb.read-token")).toBe("secret-token-value");

    const serialized = await readFile(paths.filename, "utf8");
    expect(serialized).not.toContain("secret-token-value");
    expect(JSON.parse(serialized)).toMatchObject({
      version: 1,
      algorithm: "aes-256-gcm",
    });

    const reloaded = new EncryptedFileSecretStore(paths);
    expect(await reloaded.get("tmdb.read-token")).toBe("secret-token-value");
    await reloaded.delete("tmdb.read-token");
    expect(await reloaded.has("tmdb.read-token")).toBe(false);
  });

  it("rejects a different key and invalid key material", async () => {
    const paths = await fixture();
    const store = new EncryptedFileSecretStore(paths);
    await store.set("webshare.wst", "session");

    await writeFile(paths.keyFilename, randomBytes(32).toString("base64"));
    expect(await new EncryptedFileSecretStore(paths).isReady()).toBe(false);
    await writeFile(paths.keyFilename, "not-a-32-byte-key");
    expect(await new EncryptedFileSecretStore(paths).isReady()).toBe(false);
  });

  it("requires key and vault to be separate files", async () => {
    const paths = await fixture();
    expect(
      () =>
        new EncryptedFileSecretStore({
          filename: paths.keyFilename,
          keyFilename: paths.keyFilename,
        }),
    ).toThrow(/separate files/);
  });
});
