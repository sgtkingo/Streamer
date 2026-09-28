import type { FastifyInstance } from "fastify";
import {
  preflightOllama,
  type InferenceFetch,
} from "../integrations/ollama-preflight.js";
import type { RuntimeConfig } from "../runtime-config.js";
import type { IntegrationStateStore } from "../stores/integration-state-store.js";

export interface InferenceRouteDependencies {
  fetch: InferenceFetch;
  config: RuntimeConfig["inference"];
  integrationStateStore: IntegrationStateStore;
  now: () => Date;
}

export function registerInferenceRoutes(
  app: FastifyInstance,
  dependencies: InferenceRouteDependencies,
): void {
  app.post("/api/v1/inference/detect", async () => {
    const result = await preflightOllama(dependencies);
    await dependencies.integrationStateStore.set({
      integrationId: "ollama",
      status:
        result.state === "READY" || result.state === "DEGRADED"
          ? "connected"
          : result.state === "OFFLINE" || result.state === "OOM"
            ? "unavailable"
            : "action_required",
      configured: result.ok,
      checkedAt: result.checkedAt,
      updatedAt: result.checkedAt,
    });
    return result;
  });
}
