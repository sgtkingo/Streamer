import type { FastifyInstance } from "fastify";

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>;
}

export function registerInferenceRoutes(app: FastifyInstance): void {
  app.post("/api/v1/inference/detect", async () => {
    try {
      const response = await fetch("http://127.0.0.1:11434/api/tags", {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(1_500),
      });
      if (!response.ok) throw new Error("Ollama is not ready");
      const body = (await response.json()) as OllamaTagsResponse;
      const model = body.models?.find((item) => item.name?.trim())?.name;
      if (model === undefined) {
        return {
          ok: false,
          runtime: "Ollama",
          message: "Ollama is running, but no compatible model is installed.",
        };
      }
      return {
        ok: true,
        runtime: "Ollama",
        model,
        message: "Local AI is ready.",
      };
    } catch {
      return {
        ok: false,
        runtime: "Ollama",
        message:
          "Ollama was not detected. You can continue and connect it later.",
      };
    }
  });
}
