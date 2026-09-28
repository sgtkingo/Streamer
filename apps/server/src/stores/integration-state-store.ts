import { IntegrationIdSchema } from "@streamer-ai/contracts";
import type { StreamerDatabase } from "@streamer-ai/database";
import type { StorePersistence } from "./secret-store.js";

export type IntegrationConnectionStatus =
  "not_configured" | "connected" | "action_required" | "unavailable";

export interface IntegrationState {
  integrationId: string;
  status: IntegrationConnectionStatus;
  configured: boolean;
  checkedAt?: string;
  updatedAt: string;
}

/** Stores sanitized integration state only; secret references do not belong here. */
export interface IntegrationStateStore {
  readonly persistence: StorePersistence;
  readonly isPersistent: boolean;

  isReady(): Promise<boolean>;
  get(integrationId: string): Promise<IntegrationState | undefined>;
  list(): Promise<IntegrationState[]>;
  set(state: IntegrationState): Promise<void>;
  delete(integrationId: string): Promise<void>;
}

/**
 * Development/test-only integration state. It is deliberately named and
 * reported as non-persistent so setup screens cannot imply durable storage.
 */
export class NonPersistentMemoryIntegrationStateStore implements IntegrationStateStore {
  readonly persistence = "memory" as const;
  readonly isPersistent = false;
  readonly #states = new Map<string, IntegrationState>();

  async isReady(): Promise<boolean> {
    return true;
  }

  async get(integrationId: string): Promise<IntegrationState | undefined> {
    const value = this.#states.get(integrationId);
    return value === undefined ? undefined : { ...value };
  }

  async list(): Promise<IntegrationState[]> {
    return [...this.#states.values()].map((state) => ({ ...state }));
  }

  async set(state: IntegrationState): Promise<void> {
    this.#states.set(state.integrationId, { ...state });
  }

  async delete(integrationId: string): Promise<void> {
    this.#states.delete(integrationId);
  }
}

/** Durable sanitized state. Credentials remain exclusively in SecretStore. */
export class SqliteIntegrationStateStore implements IntegrationStateStore {
  readonly persistence = "persistent" as const;
  readonly isPersistent = true;

  constructor(private readonly database: StreamerDatabase) {}

  async isReady(): Promise<boolean> {
    try {
      this.database.integrations.list();
      return true;
    } catch {
      return false;
    }
  }

  async get(integrationId: string): Promise<IntegrationState | undefined> {
    const value = this.database.integrations.get(
      IntegrationIdSchema.parse(integrationId),
    );
    if (value === null) return undefined;
    return {
      integrationId: value.id,
      status:
        value.setupStatus === "ready" || value.setupStatus === "degraded"
          ? "connected"
          : value.healthStatus === "unavailable"
            ? "unavailable"
            : value.setupStatus === "not-configured" ||
                value.setupStatus === "disabled"
              ? "not_configured"
              : "action_required",
      configured:
        value.setupStatus === "ready" || value.setupStatus === "degraded",
      ...(value.lastCheckedAt === null
        ? {}
        : { checkedAt: value.lastCheckedAt }),
      updatedAt: value.updatedAt,
    };
  }

  async list(): Promise<IntegrationState[]> {
    const values = await Promise.all(
      this.database.integrations.list().map((item) => this.get(item.id)),
    );
    return values.filter(
      (item): item is IntegrationState => item !== undefined,
    );
  }

  async set(state: IntegrationState): Promise<void> {
    const id = IntegrationIdSchema.parse(state.integrationId);
    const setupStatus = state.configured
      ? state.status === "action_required"
        ? "degraded"
        : "ready"
      : state.status === "not_configured"
        ? "needs-user-action"
        : state.status === "action_required"
          ? "needs-user-action"
          : "failed";
    const healthStatus =
      state.status === "connected"
        ? "healthy"
        : state.status === "unavailable"
          ? "unavailable"
          : state.status === "action_required"
            ? "degraded"
            : "unknown";
    this.database.integrations.upsert({
      id,
      enabled: state.status !== "not_configured",
      setupStatus,
      healthStatus,
      healthCode: null,
      lastCheckedAt: state.checkedAt ?? null,
    });
  }

  async delete(integrationId: string): Promise<void> {
    this.database.integrations.upsert({
      id: IntegrationIdSchema.parse(integrationId),
      enabled: false,
      setupStatus: "disabled",
      healthStatus: "disabled",
      healthCode: null,
      lastCheckedAt: null,
    });
  }
}
