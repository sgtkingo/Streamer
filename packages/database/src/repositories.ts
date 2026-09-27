import {
  INTEGRATION_DESCRIPTORS,
  IntegrationHealthStateSchema,
  IntegrationIdSchema,
  IntegrationPublicStatusSchema,
  IntegrationSetupStateSchema,
  SupportedLocaleSchema,
  type CredentialState,
  type IntegrationId,
  type IntegrationPublicStatus,
} from "@streamer/contracts";
import type BetterSqlite3 from "better-sqlite3";

import { DatabaseValidationError, ProfileLimitError } from "./errors.js";
import type {
  ClaimJobInput,
  Clock,
  CreateProfileInput,
  EnqueueJobInput,
  EnqueueSyncOperationInput,
  Job,
  Profile,
  SyncOutboxOperation,
  UpdateProfileInput,
  UpsertIntegrationConnectionInput,
} from "./types.js";

interface ProfileRow {
  id: string;
  name: string;
  locale: string;
  preferences_json: string;
  created_at: string;
  updated_at: string;
}

interface IntegrationConnectionRow {
  integration_id: string;
  enabled: number;
  setup_status: string;
  health_status: string;
  secret_ref: string | null;
  health_code: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

interface JobRow {
  id: string;
  kind: string;
  payload_json: string;
  state: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  available_at: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
  unique_key: string | null;
  created_at: string;
  updated_at: string;
}

interface SyncOutboxRow {
  op_id: string;
  device_id: string;
  profile_id: string | null;
  entity_type: string;
  entity_id: string;
  schema_version: number;
  hlc: string;
  payload_json: string;
  tombstone: number;
  attempts: number;
  available_at: string;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
}

const isoNow = (clock: Clock): string => clock().toISOString();

function assertShortString(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new DatabaseValidationError(`${label} must contain between 1 and ${maxLength} characters.`);
  }
  return normalized;
}

function stringifyJson(value: unknown, label: string): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new Error("not JSON serializable");
    }
    return serialized;
  } catch {
    throw new DatabaseValidationError(`${label} must be JSON serializable.`);
  }
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function assertIsoTimestamp(value: string, label: string): string {
  const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!rfc3339.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new DatabaseValidationError(`${label} must be an ISO timestamp.`);
  }
  return value;
}

function profileFromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    locale: SupportedLocaleSchema.parse(row.locale),
    preferences: parseJson<Record<string, unknown>>(row.preferences_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function credentialState(row: IntegrationConnectionRow): CredentialState {
  const descriptor = INTEGRATION_DESCRIPTORS[IntegrationIdSchema.parse(row.integration_id)];
  if (descriptor.setupMode === "local-runtime" || descriptor.setupMode === "informed-consent") {
    return "not-required";
  }
  return row.secret_ref === null ? "missing" : "stored";
}

/**
 * The only conversion from the secret-bearing persistence row to its API-safe
 * representation. It constructs a fresh object and validates strict output, so
 * future columns cannot leak through object spreading.
 */
export function toPublicIntegrationConnection(row: IntegrationConnectionRow): IntegrationPublicStatus {
  return IntegrationPublicStatusSchema.parse({
    id: row.integration_id,
    enabled: row.enabled === 1,
    setupStatus: row.setup_status,
    healthStatus: row.health_status,
    credentialStatus: credentialState(row),
    healthCode: row.health_code,
    lastCheckedAt: row.last_checked_at,
    updatedAt: row.updated_at,
  });
}

function jobFromRow<TPayload>(row: JobRow): Job<TPayload> {
  return {
    id: row.id,
    kind: row.kind,
    payload: parseJson<TPayload>(row.payload_json),
    state: row.state as Job<TPayload>["state"],
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    availableAt: row.available_at,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    lastError: row.last_error,
    uniqueKey: row.unique_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function syncOperationFromRow<TPayload>(row: SyncOutboxRow): SyncOutboxOperation<TPayload> {
  return {
    opId: row.op_id,
    deviceId: row.device_id,
    profileId: row.profile_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    schemaVersion: row.schema_version,
    hlc: row.hlc,
    payload: parseJson<TPayload>(row.payload_json),
    tombstone: row.tombstone === 1,
    attempts: row.attempts,
    availableAt: row.available_at,
    lastError: row.last_error,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
  };
}

export class SettingsRepository {
  constructor(
    private readonly database: BetterSqlite3.Database,
    private readonly clock: Clock,
  ) {}

  get<T>(key: string): T | null {
    const row = this.database
      .prepare("SELECT value_json FROM app_settings WHERE key = ?")
      .get(assertShortString(key, "Setting key", 120)) as { value_json: string } | undefined;
    return row === undefined ? null : parseJson<T>(row.value_json);
  }

  set(key: string, value: unknown): void {
    this.database
      .prepare(`
        INSERT INTO app_settings (key, value_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
      `)
      .run(assertShortString(key, "Setting key", 120), stringifyJson(value, "Setting value"), isoNow(this.clock));
  }

  delete(key: string): boolean {
    return (
      this.database.prepare("DELETE FROM app_settings WHERE key = ?").run(assertShortString(key, "Setting key", 120))
        .changes > 0
    );
  }
}

export class ProfilesRepository {
  constructor(
    private readonly database: BetterSqlite3.Database,
    private readonly clock: Clock,
  ) {}

  create(input: CreateProfileInput): Profile {
    const now = isoNow(this.clock);
    try {
      this.database
        .prepare(`
          INSERT INTO profiles (id, name, locale, preferences_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(
          assertShortString(input.id, "Profile id", 120),
          assertShortString(input.name, "Profile name", 80),
          SupportedLocaleSchema.parse(input.locale),
          stringifyJson(input.preferences ?? {}, "Profile preferences"),
          now,
          now,
        );
    } catch (error) {
      if (error instanceof Error && error.message.includes("PROFILE_LIMIT_REACHED")) {
        throw new ProfileLimitError();
      }
      throw error;
    }
    return this.getRequired(input.id);
  }

  get(id: string): Profile | null {
    const row = this.database
      .prepare("SELECT * FROM profiles WHERE id = ?")
      .get(assertShortString(id, "Profile id", 120)) as ProfileRow | undefined;
    return row === undefined ? null : profileFromRow(row);
  }

  getRequired(id: string): Profile {
    const profile = this.get(id);
    if (profile === null) {
      throw new DatabaseValidationError(`Profile '${id}' does not exist.`);
    }
    return profile;
  }

  list(): Profile[] {
    return (this.database.prepare("SELECT * FROM profiles ORDER BY created_at, id").all() as ProfileRow[]).map(
      profileFromRow,
    );
  }

  count(): number {
    return (this.database.prepare("SELECT count(*) AS count FROM profiles").get() as { count: number }).count;
  }

  update(id: string, patch: UpdateProfileInput): Profile {
    const current = this.getRequired(id);
    this.database
      .prepare(`
        UPDATE profiles
        SET name = ?, locale = ?, preferences_json = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        patch.name === undefined ? current.name : assertShortString(patch.name, "Profile name", 80),
        patch.locale === undefined ? current.locale : SupportedLocaleSchema.parse(patch.locale),
        stringifyJson(patch.preferences ?? current.preferences, "Profile preferences"),
        isoNow(this.clock),
        current.id,
      );
    return this.getRequired(current.id);
  }

  delete(id: string): boolean {
    return (
      this.database.prepare("DELETE FROM profiles WHERE id = ?").run(assertShortString(id, "Profile id", 120)).changes > 0
    );
  }
}

export class IntegrationsRepository {
  constructor(
    private readonly database: BetterSqlite3.Database,
    private readonly clock: Clock,
  ) {}

  get(id: IntegrationId): IntegrationPublicStatus | null {
    const row = this.getStored(IntegrationIdSchema.parse(id));
    return row === null ? null : toPublicIntegrationConnection(row);
  }

  list(): IntegrationPublicStatus[] {
    return (
      this.database.prepare("SELECT * FROM integration_connections ORDER BY integration_id").all() as IntegrationConnectionRow[]
    ).map(toPublicIntegrationConnection);
  }

  upsert(input: UpsertIntegrationConnectionInput): IntegrationPublicStatus {
    const id = IntegrationIdSchema.parse(input.id);
    const existing = this.getStored(id);
    const hasSecretRef = Object.prototype.hasOwnProperty.call(input, "secretRef");
    const secretRef = hasSecretRef ? this.validateSecretRef(input.secretRef ?? null) : (existing?.secret_ref ?? null);
    const healthCode = input.healthCode === undefined ? (existing?.health_code ?? null) : input.healthCode;
    if (healthCode !== null) {
      assertShortString(healthCode, "Health code", 80);
    }
    const lastCheckedAt =
      input.lastCheckedAt === undefined ? (existing?.last_checked_at ?? null) : input.lastCheckedAt;
    if (lastCheckedAt !== null) {
      assertIsoTimestamp(lastCheckedAt, "Last checked at");
    }
    const now = isoNow(this.clock);

    this.database
      .prepare(`
        INSERT INTO integration_connections (
          integration_id, enabled, setup_status, health_status, secret_ref, health_code,
          last_checked_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(integration_id) DO UPDATE SET
          enabled = excluded.enabled,
          setup_status = excluded.setup_status,
          health_status = excluded.health_status,
          secret_ref = excluded.secret_ref,
          health_code = excluded.health_code,
          last_checked_at = excluded.last_checked_at,
          updated_at = excluded.updated_at
      `)
      .run(
        id,
        input.enabled ? 1 : 0,
        IntegrationSetupStateSchema.parse(input.setupStatus),
        IntegrationHealthStateSchema.parse(input.healthStatus),
        secretRef,
        healthCode,
        lastCheckedAt,
        existing?.created_at ?? now,
        now,
      );

    const publicConnection = this.get(id);
    if (publicConnection === null) {
      throw new Error(`Integration '${id}' was not persisted.`);
    }
    return publicConnection;
  }

  /** Resolve only at the secret-manager boundary; never return this value through an API. */
  getSecretRef(id: IntegrationId): string | null {
    return this.getStored(IntegrationIdSchema.parse(id))?.secret_ref ?? null;
  }

  clearSecretRef(id: IntegrationId): void {
    this.database
      .prepare("UPDATE integration_connections SET secret_ref = NULL, updated_at = ? WHERE integration_id = ?")
      .run(isoNow(this.clock), IntegrationIdSchema.parse(id));
  }

  private getStored(id: IntegrationId): IntegrationConnectionRow | null {
    return (
      (this.database.prepare("SELECT * FROM integration_connections WHERE integration_id = ?").get(id) as
        | IntegrationConnectionRow
        | undefined) ?? null
    );
  }

  private validateSecretRef(value: string | null): string | null {
    if (value === null) {
      return null;
    }
    const normalized = assertShortString(value, "Secret reference", 512);
    if (!/^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(normalized)) {
      throw new DatabaseValidationError("Secret reference must be an opaque URI, not a credential value.");
    }
    return normalized;
  }
}

export class JobsRepository {
  constructor(
    private readonly database: BetterSqlite3.Database,
    private readonly clock: Clock,
  ) {}

  enqueue<TPayload>(input: EnqueueJobInput<TPayload>): Job<TPayload> {
    const now = isoNow(this.clock);
    const availableAt = input.availableAt === undefined ? now : assertIsoTimestamp(input.availableAt, "Available at");
    this.database
      .prepare(`
        INSERT INTO jobs (
          id, kind, payload_json, state, priority, attempts, max_attempts, available_at,
          unique_key, created_at, updated_at
        ) VALUES (?, ?, ?, 'queued', ?, 0, ?, ?, ?, ?, ?)
      `)
      .run(
        assertShortString(input.id, "Job id", 120),
        assertShortString(input.kind, "Job kind", 120),
        stringifyJson(input.payload, "Job payload"),
        input.priority ?? 0,
        input.maxAttempts ?? 3,
        availableAt,
        input.uniqueKey ?? null,
        now,
        now,
      );
    return this.getRequired<TPayload>(input.id);
  }

  get<TPayload = unknown>(id: string): Job<TPayload> | null {
    const row = this.database
      .prepare("SELECT * FROM jobs WHERE id = ?")
      .get(assertShortString(id, "Job id", 120)) as JobRow | undefined;
    return row === undefined ? null : jobFromRow<TPayload>(row);
  }

  claimNext<TPayload = unknown>(input: ClaimJobInput): Job<TPayload> | null {
    const workerId = assertShortString(input.workerId, "Worker id", 120);
    if (!Number.isInteger(input.leaseMs) || input.leaseMs < 1_000) {
      throw new DatabaseValidationError("Job lease must be at least 1000ms.");
    }
    const kinds = input.kinds?.map((kind) => assertShortString(kind, "Job kind", 120)) ?? [];

    return this.database.transaction(() => {
      const nowDate = this.clock();
      const now = nowDate.toISOString();
      const kindClause = kinds.length === 0 ? "" : ` AND kind IN (${kinds.map(() => "?").join(", ")})`;
      const row = this.database
        .prepare(`
          SELECT * FROM jobs
          WHERE attempts < max_attempts
            AND (
              (state = 'queued' AND available_at <= ?)
              OR (state = 'running' AND lease_expires_at <= ?)
            )
            ${kindClause}
          ORDER BY priority DESC, created_at, id
          LIMIT 1
        `)
        .get(now, now, ...kinds) as JobRow | undefined;
      if (row === undefined) {
        return null;
      }
      const leaseExpiresAt = new Date(nowDate.getTime() + input.leaseMs).toISOString();
      this.database
        .prepare(`
          UPDATE jobs
          SET state = 'running', attempts = attempts + 1, lease_owner = ?, lease_expires_at = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(workerId, leaseExpiresAt, now, row.id);
      return this.getRequired<TPayload>(row.id);
    })();
  }

  complete(id: string, workerId: string): boolean {
    const now = isoNow(this.clock);
    return (
      this.database
        .prepare(`
          UPDATE jobs
          SET state = 'succeeded', lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
          WHERE id = ? AND state = 'running' AND lease_owner = ?
        `)
        .run(now, assertShortString(id, "Job id", 120), assertShortString(workerId, "Worker id", 120)).changes > 0
    );
  }

  fail(id: string, workerId: string, errorCode: string, retryAt?: string): boolean {
    const job = this.getRequired(id);
    const now = isoNow(this.clock);
    const retry = retryAt === undefined ? now : assertIsoTimestamp(retryAt, "Retry at");
    const nextState = job.attempts >= job.maxAttempts ? "failed" : "queued";
    return (
      this.database
        .prepare(`
          UPDATE jobs
          SET state = ?, available_at = ?, lease_owner = NULL, lease_expires_at = NULL,
              last_error = ?, updated_at = ?
          WHERE id = ? AND state = 'running' AND lease_owner = ?
        `)
        .run(
          nextState,
          retry,
          assertShortString(errorCode, "Job error code", 240),
          now,
          job.id,
          assertShortString(workerId, "Worker id", 120),
        ).changes > 0
    );
  }

  private getRequired<TPayload = unknown>(id: string): Job<TPayload> {
    const job = this.get<TPayload>(id);
    if (job === null) {
      throw new DatabaseValidationError(`Job '${id}' does not exist.`);
    }
    return job;
  }
}

export class SyncOutboxRepository {
  constructor(
    private readonly database: BetterSqlite3.Database,
    private readonly clock: Clock,
  ) {}

  enqueue<TPayload>(input: EnqueueSyncOperationInput<TPayload>): SyncOutboxOperation<TPayload> {
    if (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1) {
      throw new DatabaseValidationError("Sync schema version must be a positive integer.");
    }
    const now = isoNow(this.clock);
    this.database
      .prepare(`
        INSERT INTO sync_outbox (
          op_id, device_id, profile_id, entity_type, entity_id, schema_version, hlc,
          payload_json, tombstone, attempts, available_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `)
      .run(
        assertShortString(input.opId, "Operation id", 120),
        assertShortString(input.deviceId, "Device id", 120),
        input.profileId === undefined || input.profileId === null
          ? null
          : assertShortString(input.profileId, "Profile id", 120),
        assertShortString(input.entityType, "Entity type", 120),
        assertShortString(input.entityId, "Entity id", 240),
        input.schemaVersion,
        assertShortString(input.hlc, "Hybrid logical timestamp", 120),
        stringifyJson(input.payload, "Sync payload"),
        input.tombstone === true ? 1 : 0,
        input.availableAt === undefined ? now : assertIsoTimestamp(input.availableAt, "Available at"),
        now,
      );
    return this.getRequired<TPayload>(input.opId);
  }

  listPending<TPayload = unknown>(limit = 100): SyncOutboxOperation<TPayload>[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
      throw new DatabaseValidationError("Outbox batch limit must be between 1 and 1000.");
    }
    const rows = this.database
      .prepare(`
        SELECT * FROM sync_outbox
        WHERE delivered_at IS NULL AND available_at <= ?
        ORDER BY created_at, op_id
        LIMIT ?
      `)
      .all(isoNow(this.clock), limit) as SyncOutboxRow[];
    return rows.map(syncOperationFromRow<TPayload>);
  }

  markDelivered(opIds: readonly string[]): number {
    if (opIds.length === 0) {
      return 0;
    }
    const ids = opIds.map((id) => assertShortString(id, "Operation id", 120));
    const placeholders = ids.map(() => "?").join(", ");
    return this.database
      .prepare(`UPDATE sync_outbox SET delivered_at = ?, last_error = NULL WHERE op_id IN (${placeholders})`)
      .run(isoNow(this.clock), ...ids).changes;
  }

  markFailed(opId: string, errorCode: string, retryAt: string): boolean {
    return (
      this.database
        .prepare(`
          UPDATE sync_outbox
          SET attempts = attempts + 1, last_error = ?, available_at = ?
          WHERE op_id = ? AND delivered_at IS NULL
        `)
        .run(
          assertShortString(errorCode, "Sync error code", 240),
          assertIsoTimestamp(retryAt, "Retry at"),
          assertShortString(opId, "Operation id", 120),
        ).changes > 0
    );
  }

  pruneDelivered(before: string): number {
    return this.database
      .prepare("DELETE FROM sync_outbox WHERE delivered_at IS NOT NULL AND delivered_at < ?")
      .run(assertIsoTimestamp(before, "Prune before")).changes;
  }

  private getRequired<TPayload>(opId: string): SyncOutboxOperation<TPayload> {
    const row = this.database
      .prepare("SELECT * FROM sync_outbox WHERE op_id = ?")
      .get(assertShortString(opId, "Operation id", 120)) as SyncOutboxRow | undefined;
    if (row === undefined) {
      throw new DatabaseValidationError(`Sync operation '${opId}' does not exist.`);
    }
    return syncOperationFromRow<TPayload>(row);
  }
}
