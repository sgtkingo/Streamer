import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  openStreamerDatabase,
  type StreamerDatabase,
} from "@streamer-ai/database";
import type { InferenceFetch } from "./integrations/ollama-preflight.js";
import { type FetchLike } from "./integrations/tmdb-client.js";
import { createAppLogger } from "./logging.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerContentRoutes } from "./routes/content.js";
import { registerInferenceRoutes } from "./routes/inference.js";
import { registerPlaybackRoutes } from "./routes/playback.js";
import { registerTmdbRoutes } from "./routes/tmdb.js";
import { StreamerCore } from "./services/streamer-core.js";
import type { StreamerContentProvider } from "./services/content-provider.js";
import {
  InMemoryPlaybackTicketStore,
  type PlaybackTicketStore,
} from "./services/playback-ticket-store.js";
import {
  SqliteIntegrationStateStore,
  type IntegrationStateStore,
} from "./stores/integration-state-store.js";
import { createSecretStore, type SecretStore } from "./stores/secret-store.js";
import { readRuntimeConfig, type RuntimeConfig } from "./runtime-config.js";

export interface CreateAppOptions {
  environment?: string;
  logger?: FastifyBaseLogger | false;
  fetch?: FetchLike;
  inferenceFetch?: InferenceFetch;
  now?: () => Date;
  tmdbTimeoutMs?: number;
  secretStore?: SecretStore;
  integrationStateStore?: IntegrationStateStore;
  database?: StreamerDatabase;
  databaseFilename?: string;
  contentProvider?: StreamerContentProvider;
  runtimeConfig?: RuntimeConfig;
  playbackTicketStore?: PlaybackTicketStore;
}

function defaultFetch(): FetchLike {
  return async (url, options) => globalThis.fetch(url, options);
}

function defaultInferenceFetch(): InferenceFetch {
  return async (url, options) => globalThis.fetch(url, options);
}

function createStores(
  options: CreateAppOptions,
  database: StreamerDatabase,
  environment: string,
) {
  const secretStore = createSecretStore({ adapter: options.secretStore });
  const integrationStateStore =
    options.integrationStateStore ?? new SqliteIntegrationStateStore(database);

  if (
    environment === "production" &&
    (!secretStore.isPersistent ||
      !secretStore.capabilities.encryptedAtRest ||
      !integrationStateStore.isPersistent)
  ) {
    throw new Error(
      "Production requires an encrypted persistent SecretStore and a persistent IntegrationStateStore.",
    );
  }

  return { secretStore, integrationStateStore, environment };
}

export function createApp(options: CreateAppOptions = {}): FastifyInstance {
  const now = options.now ?? (() => new Date());
  const environment =
    options.environment ??
    options.runtimeConfig?.environment ??
    process.env.NODE_ENV ??
    "development";
  const runtimeConfig =
    options.runtimeConfig ??
    readRuntimeConfig({ ...process.env, NODE_ENV: environment });
  const ownsDatabase = options.database === undefined;
  let database = options.database;
  if (database === undefined) {
    const filename =
      options.databaseFilename ??
      (environment === "test"
        ? ":memory:"
        : resolve(runtimeConfig.server.dataDir, "streamer-ai.db"));
    if (filename !== ":memory:")
      mkdirSync(resolve(filename, ".."), { recursive: true });
    database = openStreamerDatabase({ filename, clock: now });
  }
  const stores = createStores(options, database, environment);
  const core = new StreamerCore(database, now, options.contentProvider);
  const app =
    options.logger === false
      ? Fastify({ logger: false, bodyLimit: 64 * 1024 })
      : Fastify({
          loggerInstance: options.logger ?? createAppLogger(),
          bodyLimit: 64 * 1024,
        });

  if (!stores.secretStore.isPersistent) {
    app.log.warn(
      {
        code: "VOLATILE_PLAINTEXT_SECRET_STORAGE",
        backend: stores.secretStore.capabilities.backend,
        encryptedAtRest: stores.secretStore.capabilities.encryptedAtRest,
      },
      "Development secret storage is memory-only and is not encrypted at rest",
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
    database,
    now,
  });
  registerContentRoutes(app, { core });
  registerPlaybackRoutes(
    app,
    options.playbackTicketStore ?? new InMemoryPlaybackTicketStore(now),
  );
  registerInferenceRoutes(app, {
    fetch: options.inferenceFetch ?? defaultInferenceFetch(),
    config: runtimeConfig.inference,
    integrationStateStore: stores.integrationStateStore,
    now,
  });
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
