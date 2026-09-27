import { z } from "zod";

import { IntegrationPublicStatusSchema } from "./integrations.js";
import { SupportedLocaleSchema } from "./locales.js";

export const SERVICE_HEALTH_STATES = ["healthy", "degraded", "unavailable"] as const;

export const ServiceHealthStateSchema = z.enum(SERVICE_HEALTH_STATES);

export type ServiceHealthState = z.infer<typeof ServiceHealthStateSchema>;

export const HealthCheckSchema = z
  .object({
    status: ServiceHealthStateSchema,
    code: z.string().trim().min(1).max(80).nullable(),
    checkedAt: z.string().datetime({ offset: true }),
    latencyMs: z.number().int().nonnegative().nullable(),
  })
  .strict();

export type HealthCheck = z.infer<typeof HealthCheckSchema>;

export const SetupStatusResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    onboardingComplete: z.boolean(),
    locale: SupportedLocaleSchema,
    integrations: z.array(IntegrationPublicStatusSchema),
  })
  .strict();

export type SetupStatusResponse = z.infer<typeof SetupStatusResponseSchema>;

export const HealthResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: ServiceHealthStateSchema,
    timestamp: z.string().datetime({ offset: true }),
    uptimeSeconds: z.number().nonnegative(),
    checks: z
      .object({
        database: HealthCheckSchema,
        integrations: z.array(IntegrationPublicStatusSchema),
      })
      .strict(),
  })
  .strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
