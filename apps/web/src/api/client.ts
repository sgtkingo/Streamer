import type {
  DiscoveryRequest,
  DiscoveryResponse,
  HistoryResponse,
  HomeFeed,
  LibraryResponse,
  CompleteSetupRequest,
  IntegrationConnectionResult,
  PublicIntegrationErrorCode,
  SetupProfile,
} from "@streamer-ai/contracts";

export type ConnectionState = "connected" | "not-configured" | "unavailable";
export type ProfileDraft = SetupProfile;
export type ConnectionResult = IntegrationConnectionResult;

export interface SetupStatus {
  tmdb: ConnectionState;
  localAi: ConnectionState;
}

export interface LocalAiResult {
  ok: boolean;
  message: string;
  model?: string;
  runtime?: string;
}

export interface StreamerApi {
  getSetupStatus(): Promise<SetupStatus>;
  connectTmdb(token: string): Promise<ConnectionResult>;
  detectLocalAi(): Promise<LocalAiResult>;
  completeSetup(request: CompleteSetupRequest): Promise<void>;
  getHome(profileId: string): Promise<HomeFeed>;
  discover(request: DiscoveryRequest): Promise<DiscoveryResponse>;
  getLibrary(profileId: string): Promise<LibraryResponse>;
  addToLibrary(profileId: string, titleId: string): Promise<LibraryResponse>;
  removeFromLibrary(profileId: string, titleId: string): Promise<void>;
  getHistory(profileId: string): Promise<HistoryResponse>;
  startPlayback(
    profileId: string,
    titleId: string,
  ): Promise<{ ok: true; eventId: string; library: LibraryResponse }>;
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`/api/v1${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      "The home server is unreachable. Check that StreamerAI is running.",
    );
  }

  if (!response.ok) {
    // Do not surface response bodies here: upstream errors can echo credentials.
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(
        "The credential was not accepted. Check it and try again.",
        response.status,
      );
    }
    throw new ApiError(
      "The connection could not be completed. Please try again.",
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const integrationErrors = new Set<PublicIntegrationErrorCode>([
  "CREDENTIAL_REQUIRED",
  "CREDENTIAL_REJECTED",
  "RATE_LIMITED",
  "TIMEOUT",
  "INVALID_RESPONSE",
  "PROVIDER_UNAVAILABLE",
  "SECURE_STORAGE_UNAVAILABLE",
  "UNKNOWN",
]);

/** Copies only public contract fields so an unexpected server body can never reach UI state. */
function readIntegrationResult(
  value: unknown,
): IntegrationConnectionResult | undefined {
  if (
    !isRecord(value) ||
    value.integrationId !== "tmdb" ||
    typeof value.ok !== "boolean"
  )
    return undefined;
  const persistence =
    value.persistence === "memory" || value.persistence === "secure-local"
      ? value.persistence
      : undefined;

  if (value.ok) {
    if (
      (value.status !== "verified" && value.status !== "connected") ||
      (value.messageCode !== "VERIFIED" && value.messageCode !== "CONNECTED")
    )
      return undefined;
    return {
      ok: true,
      integrationId: "tmdb",
      status: value.status,
      messageCode: value.messageCode,
      ...(persistence ? { persistence } : {}),
    };
  }

  if (
    (value.status !== "action-required" && value.status !== "unavailable") ||
    typeof value.messageCode !== "string" ||
    !integrationErrors.has(value.messageCode as PublicIntegrationErrorCode)
  )
    return undefined;
  return {
    ok: false,
    integrationId: "tmdb",
    status: value.status,
    messageCode: value.messageCode as PublicIntegrationErrorCode,
    ...(persistence ? { persistence } : {}),
  };
}

async function connectTmdb(
  token: string,
): Promise<IntegrationConnectionResult> {
  let response: Response;
  try {
    response = await fetch("/api/v1/integrations/tmdb/connect", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });
  } catch {
    throw new ApiError(
      "The home server is unreachable. Check that StreamerAI is running.",
    );
  }

  const body: unknown = await response.json().catch(() => undefined);
  const result = readIntegrationResult(body);
  if (result) return result;
  if (response.status === 401 || response.status === 403) {
    throw new ApiError(
      "The credential was not accepted. Check it and try again.",
      response.status,
    );
  }
  throw new ApiError(
    "The connection could not be completed. Please try again.",
    response.status,
  );
}

interface SetupStatusResponse {
  complete?: boolean;
  requiredSteps?: string[];
}

export const apiClient: StreamerApi = {
  getSetupStatus: async () => {
    const status = await request<SetupStatusResponse>("/setup/status");
    return {
      tmdb:
        status.requiredSteps?.includes("connect_tmdb") || !status.complete
          ? "not-configured"
          : "connected",
      localAi: "not-configured",
    };
  },
  connectTmdb,
  detectLocalAi: () =>
    request<LocalAiResult>("/inference/detect", {
      method: "POST",
    }),
  completeSetup: (payload) =>
    request<void>("/setup/complete", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getHome: (profileId) =>
    request<HomeFeed>(`/home?profileId=${encodeURIComponent(profileId)}`),
  discover: (payload) =>
    request<DiscoveryResponse>("/discovery/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getLibrary: (profileId) =>
    request<LibraryResponse>(
      `/profiles/${encodeURIComponent(profileId)}/library`,
    ),
  addToLibrary: (profileId, titleId) =>
    request<LibraryResponse>(
      `/profiles/${encodeURIComponent(profileId)}/library/${encodeURIComponent(titleId)}`,
      {
        method: "PUT",
      },
    ),
  removeFromLibrary: (profileId, titleId) =>
    request<void>(
      `/profiles/${encodeURIComponent(profileId)}/library/${encodeURIComponent(titleId)}`,
      {
        method: "DELETE",
      },
    ),
  getHistory: (profileId) =>
    request<HistoryResponse>(
      `/profiles/${encodeURIComponent(profileId)}/history`,
    ),
  startPlayback: (profileId, titleId) =>
    request<{ ok: true; eventId: string; library: LibraryResponse }>(
      `/profiles/${encodeURIComponent(profileId)}/playback/start`,
      { method: "POST", body: JSON.stringify({ titleId }) },
    ),
};

export function safeErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Something unexpected happened. No credentials were logged; please try again.";
}
