import { describe, expect, it } from "vitest";
import {
  preflightOllama,
  readRuntimeConfig,
  type InferenceFetch,
} from "../src/index.js";

const config = readRuntimeConfig({
  INFERENCE_BASE_URL: "http://127.0.0.1:11434",
  INFERENCE_MODEL: "qwen3.5:4b",
  INFERENCE_TIMEOUT_MS: "1000",
});

function response(value: unknown) {
  return { ok: true, status: 200, json: async () => value };
}

describe("Ollama preflight", () => {
  it("requires version, approved model metadata, structured output, tools and residency", async () => {
    const fetch: InferenceFetch = async (url) => {
      if (url.endsWith("/api/version")) return response({ version: "0.6.0" });
      if (url.endsWith("/api/tags")) {
        return response({
          models: [{ name: "qwen3.5:4b", digest: "sha256:test" }],
        });
      }
      if (url.endsWith("/api/show")) {
        return response({
          license: "Apache License 2.0",
          capabilities: ["completion", "tools"],
          details: {
            family: "qwen3",
            parameter_size: "4B",
            quantization_level: "Q4_K_M",
          },
        });
      }
      if (url.endsWith("/api/generate")) {
        return response({ response: '{"ready":true,"language":"cs"}' });
      }
      if (url.endsWith("/api/chat")) {
        return response({
          message: {
            tool_calls: [
              {
                function: {
                  name: "echo",
                  arguments: { value: "streamer-ai-canary" },
                },
              },
            ],
          },
        });
      }
      return response({
        models: [
          {
            name: "qwen3.5:4b",
            size: 3_000_000_000,
            size_vram: 2_900_000_000,
            context_length: 4096,
          },
        ],
      });
    };

    await expect(
      preflightOllama({
        fetch,
        config: config.inference,
        now: () => new Date("2026-09-28T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      ok: true,
      state: "READY",
      model: "qwen3.5:4b",
      checks: {
        version: true,
        model: true,
        metadata: true,
        structuredOutput: true,
        tools: true,
        residency: true,
      },
    });
  });

  it("reports a missing model without attempting inference", async () => {
    const calls: string[] = [];
    const fetch: InferenceFetch = async (url) => {
      calls.push(url);
      return url.endsWith("/api/version")
        ? response({ version: "0.6.0" })
        : response({ models: [] });
    };
    const result = await preflightOllama({
      fetch,
      config: config.inference,
      now: () => new Date("2026-09-28T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ ok: false, state: "MODEL_MISSING" });
    expect(calls).toHaveLength(2);
  });
});

describe("runtime inference configuration", () => {
  it("permits loopback HTTP but requires TLS for remote inference", () => {
    expect(
      readRuntimeConfig({
        INFERENCE_BASE_URL: "http://127.0.0.1:11434",
      }).inference.baseUrl,
    ).toBe("http://127.0.0.1:11434");
    expect(() =>
      readRuntimeConfig({ INFERENCE_BASE_URL: "http://ai.example.test" }),
    ).toThrow(/must use HTTPS/);
    expect(
      readRuntimeConfig({ INFERENCE_BASE_URL: "https://ai.example.test" })
        .inference.baseUrl,
    ).toBe("https://ai.example.test");
  });
});
