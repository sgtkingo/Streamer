import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  openStreamerDatabase,
  type StreamerDatabase,
} from "@streamer-ai/database";
import { type FetchLike } from "./integrations/tmdb-client.js";
import { createAppLogger } from "./logging.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerContentRoutes } from "./routes/content.js";
import { registerInferenceRoutes } from "./routes/inference.js";
import { registerTmdbRoutes } from "./routes/tmdb.js";
import { StreamerCore } from "./services/streamer-core.js";
import type { StreamerContentProvider } from "./services/content-provider.js";
import {
  NonPersistentMemoryIntegrationStateStore,
  type IntegrationStateStore,
} from "./stores/integration-state-store.js";
import {
  NonPersistentMemorySecretStore,
  type SecretStore,
} from "./stores/secret-store.js";

export interface CreateAppOptions {
  environment?: string;
  logger?: FastifyBaseLogger | false;
  fetch?: FetchLike;
  now?: () => Date;
  tmdbTimeoutMs?: number;
  secretStore?: SecretStore;
  integrationStateStore?: IntegrationStateStore;
  database?: StreamerDatabase;
  databaseFilename?: string;
  contentProvider?: StreamerContentProvider;
}

function defaultFetch(): FetchLike {
  return async (url, options) => globalThis.fetch(url, options);
}

function createStores(options: CreateAppOptions) {
  const secretStore =
    options.secretStore ?? new NonPersistentMemorySecretStore();
  const integrationStateStore =
    options.integrationStateStore ??
    new NonPersistentMemoryIntegrationStateStore();
  const environment =
    options.environment ?? process.env.NODE_ENV ?? "development";

  if (
    environment === "production" &&
    (!secretStore.isPersistent || !integrationStateStore.isPersistent)
  ) {
    throw new Error(
      "Production requires persistent SecretStore and IntegrationStateStore implementations.",
    );
  }

  return { secretStore, integrationStateStore, environment };
}

export function createApp(options: CreateAppOptions = {}): FastifyInstance {
  const stores = createStores(options);
  const now = options.now ?? (() => new Date());
  const ownsDatabase = options.database === undefined;
  let database = options.database;
  if (database === undefined) {
    const filename =
      options.databaseFilename ??
      (stores.environment === "test"
        ? ":memory:"
        : resolve(process.env.STREAMERAI_DATA_DIR ?? "data", "streamer-ai.db"));
    if (filename !== ":memory:")
      mkdirSync(resolve(filename, ".."), { recursive: true });
    database = openStreamerDatabase({ filename, clock: now });
  }
  const core = new StreamerCore(database, now, options.contentProvider);
  const app =
    options.logger === false
      ? Fastify({ logger: false, bodyLimit: 64 * 1024 })
      : Fastify({
          loggerInstance: options.logger ?? createAppLogger(),
          bodyLimit: 64 * 1024,
        });

  if (
    !stores.secretStore.isPersistent ||
    !stores.integrationStateStore.isPersistent
  ) {
    app.log.warn(
      {
        code: "NON_PERSISTENT_DEVELOPMENT_STORAGE",
        persistence: "memory",
      },
      "Development memory stores are active; integration settings will not survive restart",
    );
  }

  app.setErrorHandler((error, request, reply) => {
    const validationError =
      typeof error === "object" && error !== null && "validation" in error;
    if (!validationError) {
      request.log.error(
        { err: error, code: "UNHANDLED_REQUEST_ERROR" },
        "Unhandled request error",
      );
    }

    return reply.code(validationError ? 400 : 500).send({
      error: {
        code: validationError ? "INVALID_REQUEST" : "INTERNAL_ERROR",
        message: validationError
          ? "The request is incomplete or invalid."
          : "The request could not be completed.",
      },
    });
  });

  registerSystemRoutes(app, {
    secretStore: stores.secretStore,
    integrationStateStore: stores.integrationStateStore,
    now,
  });
  registerContentRoutes(app, { core });
  registerInferenceRoutes(app);
  registerTmdbRoutes(app, {
    fetch: options.fetch ?? defaultFetch(),
    secretStore: stores.secretStore,
    integrationStateStore: stores.integrationStateStore,
    timeoutMs: options.tmdbTimeoutMs ?? 8_000,
    now,
  });

  if (ownsDatabase) {
    app.addHook("onClose", async () => database.close());
  }

  return app;
}
