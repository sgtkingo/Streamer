import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
} from "fastify";
import { type FetchLike } from "./integrations/tmdb-client.js";
import { createAppLogger } from "./logging.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerTmdbRoutes } from "./routes/tmdb.js";
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
  const environment = options.environment ?? process.env.NODE_ENV ?? "development";

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
  const app =
    options.logger === false
      ? Fastify({ logger: false, bodyLimit: 64 * 1024 })
      : Fastify({
          loggerInstance: options.logger ?? createAppLogger(),
          bodyLimit: 64 * 1024,
        });

  if (!stores.secretStore.isPersistent || !stores.integrationStateStore.isPersistent) {
    app.log.warn(
      {
        code: "NON_PERSISTENT_DEVELOPMENT_STORAGE",
        persistence: "memory",
      },
      "Development memory stores are active; integration settings will not survive restart",
    );
  }

  app.setErrorHandler((error, request, reply) => {
    const validationError = error.validation !== undefined;
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
  registerTmdbRoutes(app, {
    fetch: options.fetch ?? defaultFetch(),
    secretStore: stores.secretStore,
    integrationStateStore: stores.integrationStateStore,
    timeoutMs: options.tmdbTimeoutMs ?? 8_000,
    now,
  });

  return app;
}
