import { describe, expect, it } from "vitest";
import { OllamaAgentProvider, type OllamaFetch } from "../src/index.js";

const config = {
  provider: "ollama" as const,
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen3.5:4b",
  minimumVersion: "0.5.0",
  contextTokens: 4096,
  maxOutputTokens: 128,
  timeoutMs: 1000,
};

const context = {
  requestId: "request-0001",
  profileId: "default",
  locale: "cs" as const,
  deadlineAt: "2099-01-01T00:00:00.000Z",
  secretRef: null,
};

function response(value: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(value),
  };
}

describe("Ollama agent adapter", () => {
  it("interrupts a running Ollama request when discovery is cancelled", async () => {
    const controller = new AbortController();
    let started!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let ollamaSignal: AbortSignal | undefined;
    const fetch: OllamaFetch = async (_url, init) => {
      ollamaSignal = init.signal;
      started();
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    };
    const provider = new OllamaAgentProvider({
      config,
      fetch,
      now: () => new Date("2026-09-28T12:00:00.000Z"),
    });
    const generation = provider.generateStructured(
      {
        model: "qwen3.5:4b",
        messages: [{ role: "user", content: "Find a comedy" }],
        outputSchemaName: "titles",
        outputJsonSchema: { type: "object", properties: {} },
        allowedToolNames: [],
        temperature: 0,
        maxOutputTokens: 64,
      },
      { ...context, signal: controller.signal },
    );
    await requestStarted;
    controller.abort();
    await expect(generation).rejects.toMatchObject({ kind: "timeout" });
    expect(ollamaSignal?.aborted).toBe(true);
  });

  it("uses strict structured output without exposing a general runtime endpoint", async () => {
    let posted: Record<string, unknown> | undefined;
    const fetch: OllamaFetch = async (_url, init) => {
      posted = JSON.parse(init.body ?? "{}") as Record<string, unknown>;
      return response({
        model: "qwen3.5:4b",
        done: true,
        message: { content: '{"intent":"autumn movie"}' },
        prompt_eval_count: 12,
        eval_count: 5,
      });
    };
    const provider = new OllamaAgentProvider({
      config,
      fetch,
      now: () => new Date("2026-09-28T12:00:00.000Z"),
    });

    const result = await provider.generateStructured<{ intent: string }>(
      {
        model: "qwen3.5:4b",
        messages: [{ role: "user", content: "Podzimní film" }],
        outputSchemaName: "intent",
        outputJsonSchema: {
          type: "object",
          required: ["intent"],
          properties: { intent: { type: "string" } },
        },
        allowedToolNames: [],
        temperature: 0,
        maxOutputTokens: 64,
      },
      context,
    );

    expect(result.output).toEqual({ intent: "autumn movie" });
    expect(posted).toMatchObject({
      model: "qwen3.5:4b",
      stream: false,
      think: false,
    });
    expect(posted).not.toHaveProperty("tools");
  });
});
