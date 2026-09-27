import { describe, expect, it } from "vitest";

import {
  CompleteSetupRequestSchema,
  HealthResponseSchema,
  INTEGRATION_DESCRIPTORS,
  IntegrationConnectionResultSchema,
  IntegrationPublicStatusSchema,
  SUPPORTED_LOCALES,
  TmdbConnectRequestSchema,
} from "../src/index.js";

describe("public contracts", () => {
  it("ships complete localized integration descriptors", () => {
    for (const descriptor of Object.values(INTEGRATION_DESCRIPTORS)) {
      for (const locale of SUPPORTED_LOCALES) {
        expect(descriptor.name[locale]).not.toHaveLength(0);
        expect(descriptor.description[locale]).not.toHaveLength(0);
      }
    }
  });

  it("rejects secret-bearing public status objects", () => {
    expect(() =>
      IntegrationPublicStatusSchema.parse({
        id: "tmdb",
        enabled: true,
        setupStatus: "ready",
        healthStatus: "healthy",
        credentialStatus: "stored",
        healthCode: null,
        lastCheckedAt: "2026-09-27T10:00:00.000Z",
        updatedAt: "2026-09-27T10:00:00.000Z",
        secretRef: "vault://tmdb/token",
      }),
    ).toThrow();
  });

  it("keeps health responses versioned and strict", () => {
    expect(() =>
      HealthResponseSchema.parse({
        schemaVersion: 1,
        status: "healthy",
        timestamp: "2026-09-27T10:00:00.000Z",
        uptimeSeconds: 2,
        checks: {
          database: {
            status: "healthy",
            code: null,
            checkedAt: "2026-09-27T10:00:00.000Z",
            latencyMs: 1,
          },
          integrations: [],
        },
        token: "must not be accepted",
      }),
    ).toThrow();
  });

  it("keeps TMDB credentials inbound-only", () => {
    expect(TmdbConnectRequestSchema.parse({ token: `  ${"t".repeat(24)}  ` })).toEqual({
      token: "t".repeat(24),
    });
    expect(() =>
      IntegrationConnectionResultSchema.parse({
        ok: true,
        integrationId: "tmdb",
        status: "connected",
        messageCode: "CONNECTED",
        persistence: "secure-local",
        token: "must-never-be-returned",
      }),
    ).toThrow();
    expect(() =>
      IntegrationConnectionResultSchema.parse({
        ok: false,
        integrationId: "tmdb",
        status: "unavailable",
        messageCode: "PROVIDER_UNAVAILABLE",
        secretRef: "must-never-be-returned",
      }),
    ).toThrow();
  });

  it("validates the complete guided-setup payload", () => {
    expect(
      CompleteSetupRequestSchema.parse({
        profile: { name: "  Family  ", locale: "cs", preferences: ["Comedy"] },
        localAiEnabled: true,
      }),
    ).toEqual({
      profile: { name: "Family", locale: "cs", preferences: ["Comedy"] },
      localAiEnabled: true,
    });
  });
});
