import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MIGRATIONS, ProfileLimitError, openStreamerDatabase, type StreamerDatabase } from "../src/index.js";

const databaseInstances: StreamerDatabase[] = [];
const temporaryDirectories: string[] = [];
const fixedClock = (): Date => new Date("2026-09-27T10:00:00.000Z");

function createDatabase(): { database: StreamerDatabase; filename: string } {
  const directory = mkdtempSync(join(tmpdir(), "streamer-database-test-"));
  const filename = join(directory, "streamer.db");
  const database = openStreamerDatabase({ filename, clock: fixedClock });
  databaseInstances.push(database);
  temporaryDirectories.push(directory);
  return { database, filename };
}

afterEach(() => {
  for (const database of databaseInstances.splice(0)) {
    database.close();
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("database migrations", () => {
  it("applies every migration once, enables WAL, and seeds public integration states", () => {
    const { database, filename } = createDatabase();

    expect(database.getJournalMode()).toBe("wal");
    expect(database.getAppliedMigrationVersions()).toEqual(MIGRATIONS.map(({ version }) => version));
    expect(database.integrations.list()).toHaveLength(6);

    database.close();
    const reopened = openStreamerDatabase({ filename, clock: fixedClock });
    databaseInstances.push(reopened);
    expect(reopened.getAppliedMigrationVersions()).toEqual(MIGRATIONS.map(({ version }) => version));
    expect(reopened.integrations.list()).toHaveLength(6);
  });
});

describe("profile limit", () => {
  it("enforces five profiles in SQLite and exposes a stable domain error", () => {
    const { database } = createDatabase();

    for (let index = 1; index <= 5; index += 1) {
      database.profiles.create({
        id: `profile-${index}`,
        name: `Profile ${index}`,
        locale: index % 2 === 0 ? "cs" : "en",
      });
    }

    expect(database.profiles.count()).toBe(5);
    expect(() =>
      database.profiles.create({ id: "profile-6", name: "Profile 6", locale: "de" }),
    ).toThrow(ProfileLimitError);
    expect(database.profiles.count()).toBe(5);
  });

  it("permits a replacement after deleting a profile", () => {
    const { database } = createDatabase();
    for (let index = 1; index <= 5; index += 1) {
      database.profiles.create({ id: `profile-${index}`, name: `Profile ${index}`, locale: "en" });
    }

    expect(database.profiles.delete("profile-3")).toBe(true);
    expect(database.profiles.create({ id: "profile-6", name: "New profile", locale: "cs" }).id).toBe("profile-6");
  });
});

describe("integration connection privacy", () => {
  it("persists only an opaque secret reference and sanitizes public records", () => {
    const { database } = createDatabase();
    const publicRecord = database.integrations.upsert({
      id: "tmdb",
      enabled: true,
      setupStatus: "ready",
      healthStatus: "healthy",
      secretRef: "os-vault://streamer/tmdb-access-token",
      healthCode: null,
      lastCheckedAt: "2026-09-27T10:00:00.000Z",
    });

    expect(publicRecord).toEqual({
      id: "tmdb",
      enabled: true,
      setupStatus: "ready",
      healthStatus: "healthy",
      credentialStatus: "stored",
      healthCode: null,
      lastCheckedAt: "2026-09-27T10:00:00.000Z",
      updatedAt: "2026-09-27T10:00:00.000Z",
    });
    expect(publicRecord).not.toHaveProperty("secretRef");
    expect(JSON.stringify(database.integrations.list())).not.toContain("os-vault://");
    expect(database.integrations.getSecretRef("tmdb")).toBe("os-vault://streamer/tmdb-access-token");
  });

  it("rejects raw credentials in the secret reference field", () => {
    const { database } = createDatabase();
    expect(() =>
      database.integrations.upsert({
        id: "webshare",
        enabled: true,
        setupStatus: "checking",
        healthStatus: "unknown",
        secretRef: "plain-password",
      }),
    ).toThrow(/opaque URI/);
  });
});
