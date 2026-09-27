import type {
  IntegrationHealthState,
  IntegrationId,
  IntegrationSetupState,
  SupportedLocale,
} from "@streamer/contracts";

export type Clock = () => Date;

export interface Profile {
  id: string;
  name: string;
  locale: SupportedLocale;
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProfileInput {
  id: string;
  name: string;
  locale: SupportedLocale;
  preferences?: Record<string, unknown>;
}

export interface UpdateProfileInput {
  name?: string;
  locale?: SupportedLocale;
  preferences?: Record<string, unknown>;
}

export interface UpsertIntegrationConnectionInput {
  id: IntegrationId;
  enabled: boolean;
  setupStatus: IntegrationSetupState;
  healthStatus: IntegrationHealthState;
  /** Opaque pointer into the local secret store. Never pass a credential value. */
  secretRef?: string | null;
  healthCode?: string | null;
  lastCheckedAt?: string | null;
}

export const JOB_STATES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type JobState = (typeof JOB_STATES)[number];

export interface Job<TPayload = unknown> {
  id: string;
  kind: string;
  payload: TPayload;
  state: JobState;
  priority: number;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  lastError: string | null;
  uniqueKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueJobInput<TPayload = unknown> {
  id: string;
  kind: string;
  payload: TPayload;
  priority?: number;
  maxAttempts?: number;
  availableAt?: string;
  uniqueKey?: string | null;
}

export interface ClaimJobInput {
  workerId: string;
  leaseMs: number;
  kinds?: readonly string[];
}

export interface SyncOutboxOperation<TPayload = unknown> {
  opId: string;
  deviceId: string;
  profileId: string | null;
  entityType: string;
  entityId: string;
  schemaVersion: number;
  hlc: string;
  payload: TPayload;
  tombstone: boolean;
  attempts: number;
  availableAt: string;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface EnqueueSyncOperationInput<TPayload = unknown> {
  opId: string;
  deviceId: string;
  profileId?: string | null;
  entityType: string;
  entityId: string;
  schemaVersion: number;
  hlc: string;
  payload: TPayload;
  tombstone?: boolean;
  availableAt?: string;
}
