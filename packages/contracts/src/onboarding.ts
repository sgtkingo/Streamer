import { z } from "zod";

import { IntegrationIdSchema } from "./integrations.js";
import { SupportedLocaleSchema } from "./locales.js";

/**
 * Accepted only on the inbound setup route. Responses use
 * `IntegrationConnectionResultSchema`, which has no credential-shaped field.
 */
export const TmdbConnectRequestSchema = z
  .object({
    token: z.string().trim().min(20).max(2_048),
  })
  .strict();

export type TmdbConnectRequest = z.infer<typeof TmdbConnectRequestSchema>;

export const PUBLIC_INTEGRATION_ERROR_CODES = [
  "CREDENTIAL_REQUIRED",
  "CREDENTIAL_REJECTED",
  "RATE_LIMITED",
  "TIMEOUT",
  "INVALID_RESPONSE",
  "PROVIDER_UNAVAILABLE",
  "SECURE_STORAGE_UNAVAILABLE",
  "UNKNOWN",
] as const;

export const PublicIntegrationErrorCodeSchema = z.enum(PUBLIC_INTEGRATION_ERROR_CODES);

export type PublicIntegrationErrorCode = z.infer<typeof PublicIntegrationErrorCodeSchema>;

export const PUBLIC_INTEGRATION_SUCCESS_CODES = ["VERIFIED", "CONNECTED"] as const;

export const PublicIntegrationSuccessCodeSchema = z.enum(PUBLIC_INTEGRATION_SUCCESS_CODES);

export type PublicIntegrationSuccessCode = z.infer<typeof PublicIntegrationSuccessCodeSchema>;

export const IntegrationPersistenceSchema = z.enum(["memory", "secure-local"]);

export type IntegrationPersistence = z.infer<typeof IntegrationPersistenceSchema>;

const IntegrationConnectionSuccessSchema = z
  .object({
    ok: z.literal(true),
    integrationId: IntegrationIdSchema,
    status: z.enum(["verified", "connected"]),
    messageCode: PublicIntegrationSuccessCodeSchema,
    persistence: IntegrationPersistenceSchema.optional(),
  })
  .strict();

const IntegrationConnectionFailureSchema = z
  .object({
    ok: z.literal(false),
    integrationId: IntegrationIdSchema,
    status: z.enum(["action-required", "unavailable"]),
    messageCode: PublicIntegrationErrorCodeSchema,
    persistence: IntegrationPersistenceSchema.optional(),
  })
  .strict();

/** Stable, localized-by-message-code response that can never echo a token or secret reference. */
export const IntegrationConnectionResultSchema = z.discriminatedUnion("ok", [
  IntegrationConnectionSuccessSchema,
  IntegrationConnectionFailureSchema,
]);

export type IntegrationConnectionResult = z.infer<typeof IntegrationConnectionResultSchema>;

export const SetupProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    locale: SupportedLocaleSchema,
    preferences: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  })
  .strict();

export type SetupProfile = z.infer<typeof SetupProfileSchema>;

export const CompleteSetupRequestSchema = z
  .object({
    profile: SetupProfileSchema,
    localAiEnabled: z.boolean(),
  })
  .strict();

export type CompleteSetupRequest = z.infer<typeof CompleteSetupRequestSchema>;
