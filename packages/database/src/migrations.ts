import type BetterSqlite3 from "better-sqlite3";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "application_settings_and_profiles",
    sql: `
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY NOT NULL CHECK (length(key) BETWEEN 1 AND 120),
        value_json TEXT NOT NULL CHECK (json_valid(value_json)),
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE profiles (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 120),
        name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
        locale TEXT NOT NULL CHECK (locale IN ('en', 'cs', 'de')),
        preferences_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(preferences_json)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TRIGGER profiles_limit_before_insert
      BEFORE INSERT ON profiles
      WHEN (SELECT count(*) FROM profiles) >= 5
      BEGIN
        SELECT RAISE(ABORT, 'PROFILE_LIMIT_REACHED');
      END;
    `,
  },
  {
    version: 2,
    name: "integration_connections_and_jobs",
    sql: `
      CREATE TABLE integration_connections (
        integration_id TEXT PRIMARY KEY NOT NULL CHECK (
          integration_id IN ('tmdb', 'webshare', 'ollama', 'csfd', 'brave-search', 'cloudflare-sync')
        ),
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        setup_status TEXT NOT NULL CHECK (
          setup_status IN (
            'not-configured', 'needs-user-action', 'checking', 'ready', 'degraded', 'failed', 'disabled'
          )
        ),
        health_status TEXT NOT NULL CHECK (
          health_status IN ('unknown', 'healthy', 'degraded', 'unavailable', 'disabled')
        ),
        secret_ref TEXT CHECK (secret_ref IS NULL OR length(secret_ref) BETWEEN 1 AND 512),
        health_code TEXT CHECK (health_code IS NULL OR length(health_code) BETWEEN 1 AND 80),
        last_checked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      INSERT INTO integration_connections (
        integration_id, enabled, setup_status, health_status, created_at, updated_at
      ) VALUES
        ('tmdb', 1, 'needs-user-action', 'unknown', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('webshare', 1, 'needs-user-action', 'unknown', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('ollama', 0, 'disabled', 'disabled', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('csfd', 0, 'disabled', 'disabled', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('brave-search', 0, 'disabled', 'disabled', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('cloudflare-sync', 0, 'disabled', 'disabled', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

      CREATE TABLE jobs (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 120),
        kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 120),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
        priority INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 100),
        available_at TEXT NOT NULL,
        lease_owner TEXT,
        lease_expires_at TEXT,
        last_error TEXT,
        unique_key TEXT UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX jobs_claim_idx
        ON jobs (state, available_at, priority DESC, created_at)
        WHERE state IN ('queued', 'running');
    `,
  },
  {
    version: 3,
    name: "sync_outbox",
    sql: `
      CREATE TABLE sync_outbox (
        op_id TEXT PRIMARY KEY NOT NULL CHECK (length(op_id) BETWEEN 1 AND 120),
        device_id TEXT NOT NULL CHECK (length(device_id) BETWEEN 1 AND 120),
        profile_id TEXT,
        entity_type TEXT NOT NULL CHECK (length(entity_type) BETWEEN 1 AND 120),
        entity_id TEXT NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 240),
        schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
        hlc TEXT NOT NULL CHECK (length(hlc) BETWEEN 1 AND 120),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        tombstone INTEGER NOT NULL DEFAULT 0 CHECK (tombstone IN (0, 1)),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        available_at TEXT NOT NULL,
        last_error TEXT,
        delivered_at TEXT,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX sync_outbox_pending_idx
        ON sync_outbox (available_at, created_at)
        WHERE delivered_at IS NULL;
    `,
  },
] as const;

export function applyMigrations(database: BetterSqlite3.Database, now: () => string): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const applied = new Set(
    (database.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>).map(
      ({ version }) => version,
    ),
  );
  const insertMigration = database.prepare(
    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) {
      continue;
    }

    database.transaction(() => {
      database.exec(migration.sql);
      insertMigration.run(migration.version, migration.name, now());
    })();
  }
}
