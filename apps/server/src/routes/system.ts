import type { FastifyInstance } from "fastify";
import { tmdbCatalogItem } from "../integrations/catalog.js";
import { TMDB_READ_TOKEN_SECRET_KEY } from "../integrations/tmdb-client.js";
import type { IntegrationStateStore } from "../stores/integration-state-store.js";
import type { SecretStore } from "../stores/secret-store.js";

export interface SystemRouteDependencies {
  secretStore: SecretStore;
  integrationStateStore: IntegrationStateStore;
  now: () => Date;
}

async function getTmdbStatus(dependencies: SystemRouteDependencies) {
  const [hasSecret, state] = await Promise.all([
    dependencies.secretStore.has(TMDB_READ_TOKEN_SECRET_KEY),
    dependencies.integrationStateStore.get("tmdb"),
  ]);
  const configured = hasSecret && state?.configured === true;

  return {
    configured,
    status: configured ? "connected" : (state?.status ?? "not_configured"),
  } as const;
}

export function registerSystemRoutes(
  app: FastifyInstance,
  dependencies: SystemRouteDependencies,
): void {
  app.get("/api/v1/health/live", async () => ({
    status: "ok",
    service: "streamer-server",
    timestamp: dependencies.now().toISOString(),
  }));

  app.get("/api/v1/health/ready", async (_request, reply) => {
    const checks = await Promise.allSettled([
      dependencies.secretStore.isReady(),
      dependencies.integrationStateStore.isReady(),
    ]);
    const ready = checks.every(
      (check) => check.status === "fulfilled" && check.value,
    );

    return reply.code(ready ? 200 : 503).send({
      status: ready ? "ready" : "not_ready",
      checks: {
        secretStore:
          checks[0]?.status === "fulfilled" && checks[0].value
            ? "ready"
            : "unavailable",
        integrationStateStore:
          checks[1]?.status === "fulfilled" && checks[1].value
            ? "ready"
            : "unavailable",
      },
      timestamp: dependencies.now().toISOString(),
    });
  });

  app.get("/api/v1/setup/status", async () => {
    const tmdb = await getTmdbStatus(dependencies);
    const persistent =
      dependencies.secretStore.isPersistent &&
      dependencies.integrationStateStore.isPersistent;

    return {
      status: tmdb.configured ? "ready" : "needs_setup",
      complete: tmdb.configured,
      requiredSteps: tmdb.configured ? [] : ["connect_tmdb"],
      storage: {
        persistence: persistent ? "persistent" : "memory",
        durable: persistent,
      },
      warnings: persistent
        ? []
        : [
            {
              code: "NON_PERSISTENT_DEVELOPMENT_STORAGE",
              message:
                "Development memory storage is active. Integration settings are lost when the server restarts.",
            },
          ],
    };
  });

  app.get("/api/v1/integrations", async () => {
    const tmdb = await getTmdbStatus(dependencies);

    return {
      persistence:
        dependencies.secretStore.persistence === "memory" ||
        dependencies.integrationStateStore.persistence === "memory"
          ? "memory"
          : "persistent",
      items: [tmdbCatalogItem(tmdb.status, tmdb.configured)],
    };
  });
}
