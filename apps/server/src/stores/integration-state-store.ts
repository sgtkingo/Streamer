import type { StorePersistence } from "./secret-store.js";

export type IntegrationConnectionStatus =
  | "not_configured"
  | "connected"
  | "action_required"
  | "unavailable";

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
export class NonPersistentMemoryIntegrationStateStore
  implements IntegrationStateStore
{
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
