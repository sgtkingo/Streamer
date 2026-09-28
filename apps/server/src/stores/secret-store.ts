export type StorePersistence = "memory" | "persistent";
export type SecretStoreBackend = "memory" | "os-keychain" | "external";

export interface SecretStoreCapabilities {
  readonly persistence: StorePersistence;
  readonly backend: SecretStoreBackend;
  readonly encryptedAtRest: boolean;
}

/**
 * A boundary for recoverable application secrets.
 *
 * Implementations must encrypt durable values at rest. Callers must never log
 * returned values or expose store keys as public API identifiers.
 */
export interface SecretStore {
  readonly persistence: StorePersistence;
  readonly isPersistent: boolean;
  readonly capabilities: SecretStoreCapabilities;

  isReady(): Promise<boolean>;
  has(key: string): Promise<boolean>;
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Development/test-only secret store. Values disappear on process exit and
 * are not encrypted. Production composition rejects this implementation.
 */
export class NonPersistentMemorySecretStore implements SecretStore {
  readonly persistence = "memory" as const;
  readonly isPersistent = false;
  readonly capabilities = {
    persistence: "memory",
    backend: "memory",
    encryptedAtRest: false,
  } as const;
  readonly #values = new Map<string, string>();

  async isReady(): Promise<boolean> {
    return true;
  }

  async has(key: string): Promise<boolean> {
    return this.#values.has(key);
  }

  async get(key: string): Promise<string | undefined> {
    return this.#values.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.#values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.#values.delete(key);
  }
}

export interface CreateSecretStoreOptions {
  /**
   * Inject an OS-keychain or external secret-manager adapter. StreamerAI does
   * not pretend that its memory fallback is encrypted or durable.
   */
  adapter?: SecretStore;
}

/** Composition point for a future OS keychain adapter. */
export function createSecretStore(
  options: CreateSecretStoreOptions = {},
): SecretStore {
  const store = options.adapter ?? new NonPersistentMemorySecretStore();
  if (
    store.capabilities.persistence !== store.persistence ||
    store.capabilities.encryptedAtRest !== store.isPersistent
  ) {
    throw new Error(
      "SecretStore capabilities are inconsistent: persistent stores must provide encryption at rest.",
    );
  }
  return store;
}
