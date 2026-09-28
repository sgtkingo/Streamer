import BetterSqlite3 from "better-sqlite3";

import { applyMigrations } from "./migrations.js";
import {
  CatalogTitlesRepository,
  DiscoverySessionsRepository,
  HistoryRepository,
  IdempotencyRepository,
  IntegrationsRepository,
  JobsRepository,
  LibraryRepository,
  ProfilesRepository,
  SettingsRepository,
  SyncOutboxRepository,
} from "./repositories.js";
import type { Clock } from "./types.js";

export interface OpenStreamerDatabaseOptions {
  filename: string;
  clock?: Clock;
  busyTimeoutMs?: number;
}

export class StreamerDatabase {
  readonly settings: SettingsRepository;
  readonly profiles: ProfilesRepository;
  readonly integrations: IntegrationsRepository;
  readonly titles: CatalogTitlesRepository;
  readonly library: LibraryRepository;
  readonly history: HistoryRepository;
  readonly discoverySessions: DiscoverySessionsRepository;
  readonly idempotency: IdempotencyRepository;
  readonly jobs: JobsRepository;
  readonly syncOutbox: SyncOutboxRepository;

  private closed = false;

  constructor(
    private readonly connection: BetterSqlite3.Database,
    clock: Clock,
  ) {
    this.settings = new SettingsRepository(connection, clock);
    this.profiles = new ProfilesRepository(connection, clock);
    this.integrations = new IntegrationsRepository(connection, clock);
    this.titles = new CatalogTitlesRepository(connection, clock);
    this.library = new LibraryRepository(connection, clock);
    this.history = new HistoryRepository(connection, clock);
    this.discoverySessions = new DiscoverySessionsRepository(connection, clock);
    this.idempotency = new IdempotencyRepository(connection, clock);
    this.jobs = new JobsRepository(connection, clock);
    this.syncOutbox = new SyncOutboxRepository(connection, clock);
  }

  getJournalMode(): string {
    return String(
      this.connection.pragma("journal_mode", { simple: true }),
    ).toLowerCase();
  }

  getAppliedMigrationVersions(): number[] {
    return (
      this.connection
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all() as Array<{ version: number }>
    ).map(({ version }) => version);
  }

  /**
   * Executes synchronous repository work atomically. This is the boundary used
   * to persist a local change and its sync-outbox operation in one transaction.
   */
  transaction<T>(operation: () => T): T {
    return this.connection.transaction(operation)();
  }

  close(): void {
    if (!this.closed) {
      this.connection.close();
      this.closed = true;
    }
  }
}

export function openStreamerDatabase(
  options: OpenStreamerDatabaseOptions,
): StreamerDatabase {
  const clock = options.clock ?? (() => new Date());
  const busyTimeoutMs = options.busyTimeoutMs ?? 5_000;
  if (
    !Number.isInteger(busyTimeoutMs) ||
    busyTimeoutMs < 0 ||
    busyTimeoutMs > 60_000
  ) {
    throw new Error(
      "SQLite busy timeout must be an integer between 0 and 60000ms.",
    );
  }
  const database = new BetterSqlite3(options.filename);

  try {
    database.pragma("foreign_keys = ON");
    database.pragma(`busy_timeout = ${busyTimeoutMs}`);
    database.pragma("synchronous = NORMAL");
    const journalMode = String(
      database.pragma("journal_mode = WAL", { simple: true }),
    ).toLowerCase();
    if (options.filename !== ":memory:" && journalMode !== "wal") {
      throw new Error(
        `SQLite WAL mode is required; received '${journalMode}'.`,
      );
    }
    applyMigrations(database, () => clock().toISOString());
    return new StreamerDatabase(database, clock);
  } catch (error) {
    database.close();
    throw error;
  }
}
