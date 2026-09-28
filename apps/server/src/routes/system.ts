import { INTEGRATION_DESCRIPTORS } from "@streamer-ai/contracts";
import type { FastifyInstance } from "fastify";
import type { StreamerDatabase } from "@streamer-ai/database";
import { integrationCatalogItem } from "../integrations/catalog.js";
import { TMDB_READ_TOKEN_SECRET_KEY } from "../integrations/tmdb-client.js";
import type { IntegrationStateStore } from "../stores/integration-state-store.js";
import type { SecretStore } from "../stores/secret-store.js";

export interface SystemRouteDependencies {
  secretStore: SecretStore;
  integrationStateStore: IntegrationStateStore;
  database: StreamerDatabase;
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
    status: configured
      ? ("connected" as const)
      : state?.configured === true
        ? ("action_required" as const)
        : (state?.status ?? "not_configured"),
  } as const;
}

async function getOllamaStatus(dependencies: SystemRouteDependencies) {
  const state = await dependencies.integrationStateStore.get("ollama");
  return {
    configured: state?.configured === true,
    status: state?.status ?? "not_configured",
    checkedAt: state?.checkedAt ?? null,
  } as const;
}

async function getWebshareStatus(dependencies: SystemRouteDependencies) {
  const state = await dependencies.integrationStateStore.get("webshare");
  return {
    configured: state?.configured === true,
    status: state?.status ?? "not_configured",
    checkedAt: state?.checkedAt ?? null,
  } as const;
}

export function registerSystemRoutes(
  app: FastifyInstance,
  dependencies: SystemRouteDependencies,
): void {
  app.get("/api/v1/health/live", async () => ({
    status: "ok",
    service: "streamer-ai-server",
    timestamp: dependencies.now().toISOString(),
  }));

  app.get("/api/v1/health/ready", async (_request, reply) => {
    const checks = await Promise.allSettled([
      dependencies.secretStore.isReady(),
      dependencies.integrationStateStore.isReady(),
      Promise.resolve().then(() => {
        dependencies.database.profiles.count();
        return true;
      }),
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
        database:
          checks[2]?.status === "fulfilled" && checks[2].value
            ? "ready"
            : "unavailable",
      },
      timestamp: dependencies.now().toISOString(),
    });
  });

  app.get("/api/v1/setup/status", async () => {
    const [tmdb, webshare, ollama] = await Promise.all([
      getTmdbStatus(dependencies),
      getWebshareStatus(dependencies),
      getOllamaStatus(dependencies),
    ]);
    const profile = dependencies.database.profiles.get("default");
    const completionRecorded =
      dependencies.database.settings.get<boolean>("setup.completed") === true;
    const localAiEnabled =
      dependencies.database.settings.get<boolean>("setup.localAiEnabled") ===
      true;
    const complete = completionRecorded && profile !== null;
    const playbackAvailable = webshare.configured;
    const requiredSteps = [
      ...(!complete ? ["complete_profile"] : []),
      ...(!tmdb.configured ? ["connect_tmdb"] : []),
      ...(!webshare.configured ? ["connect_webshare"] : []),
      ...(localAiEnabled && !ollama.configured ? ["configure_local_ai"] : []),
    ];
    const durable =
      dependencies.secretStore.isPersistent &&
      dependencies.secretStore.capabilities.encryptedAtRest &&
      dependencies.integrationStateStore.isPersistent;
    const warnings = durable
      ? []
      : [
          {
            code: "VOLATILE_PLAINTEXT_SECRET_STORAGE",
            message:
              "Development credentials are kept in process memory, are not encrypted at rest, and are lost on restart.",
          },
        ];

    return {
      status: !complete
        ? "needs_setup"
        : requiredSteps.length === 0
          ? "ready"
          : "degraded",
      complete,
      requiredSteps,
      profile:
        profile === null
          ? null
          : {
              id: profile.id,
              name: profile.name,
              locale: profile.locale,
              preferences: Array.isArray(profile.preferences.genres)
                ? profile.preferences.genres.filter(
                    (value): value is string => typeof value === "string",
                  )
                : [],
            },
      integrations: {
        tmdb,
        webshare,
        localAi: {
          enabled: localAiEnabled,
          ...ollama,
        },
      },
      capabilities: {
        playback: playbackAvailable,
      },
      storage: {
        persistence: durable ? "persistent" : "mixed",
        durable,
        secrets: dependencies.secretStore.capabilities,
        integrationState: dependencies.integrationStateStore.persistence,
      },
      warnings,
    };
  });

  app.get("/api/v1/integrations", async () => {
    const tmdb = await getTmdbStatus(dependencies);
    const states = await dependencies.integrationStateStore.list();
    const byId = new Map(states.map((state) => [state.integrationId, state]));

    return {
      persistence:
        dependencies.secretStore.persistence === "memory" ||
        dependencies.integrationStateStore.persistence === "memory"
          ? "memory"
          : "persistent",
      items: Object.values(INTEGRATION_DESCRIPTORS).map((descriptor) => {
        const state = byId.get(descriptor.id);
        const status =
          descriptor.id === "tmdb"
            ? tmdb.status
            : (state?.status ?? "not_configured");
        const configured =
          descriptor.id === "tmdb"
            ? tmdb.configured
            : state?.configured === true;
        return integrationCatalogItem(descriptor, status, configured);
      }),
    };
  });
}
