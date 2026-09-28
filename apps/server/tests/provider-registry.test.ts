import { describe, expect, it } from "vitest";
import type { ProviderDescriptor } from "@streamer-ai/contracts";
import { AdapterRegistry } from "../src/index.js";

function provider(id: string, family: ProviderDescriptor["family"]) {
  return {
    descriptor: (): ProviderDescriptor => ({
      id,
      family,
      displayName: id,
      connectorVersion: "1.0.0",
      capabilities: [],
      supportedLocales: ["en"],
      setupMode: "none",
      credentialFields: [],
      canAutoDetect: false,
      supportsRecheck: true,
      supportsDisconnect: true,
      documentationUrl: null,
      privacySummary: "Test provider with no external data flow.",
    }),
  };
}

describe("provider registry", () => {
  it("supports provider-neutral lookup within one capability family", () => {
    const first = provider("metadata-a", "metadata");
    const second = provider("metadata-b", "metadata");
    const registry = new AdapterRegistry("metadata", [first, second]);

    expect(registry.list()).toEqual([first, second]);
    expect(registry.require("metadata-b")).toBe(second);
    expect(registry.get("missing")).toBeNull();
  });

  it("rejects duplicate IDs and family mismatches during composition", () => {
    expect(
      () =>
        new AdapterRegistry("metadata", [
          provider("duplicate", "metadata"),
          provider("duplicate", "metadata"),
        ]),
    ).toThrow(/more than once/);
    expect(
      () => new AdapterRegistry("metadata", [provider("media", "media")]),
    ).toThrow(/expected 'metadata'/);
  });
});
