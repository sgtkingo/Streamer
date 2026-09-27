export type StorePersistence = "memory" | "persistent";

/**
 * A boundary for recoverable application secrets.
 *
 * Implementations must encrypt durable values at rest. Callers must never log
 * returned values or expose store keys as public API identifiers.
 */
export interface SecretStore {
  readonly persistence: StorePersistence;
  readonly isPersistent: boolean;

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
