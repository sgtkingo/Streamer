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
  PlaybackGrant as PlaybackGrantContract,
  PlaybackMediaInfo,
  IntegrationId,
} from "@streamer-ai/contracts";

export type ConnectionState = "connected" | "not-configured" | "unavailable";
export type { PlaybackGrant, PlaybackMediaInfo } from "@streamer-ai/contracts";
export type ProfileDraft = SetupProfile;
export type ConnectionResult = IntegrationConnectionResult;

export interface SetupStatus {
  complete: boolean;
  tmdb: ConnectionState;
  webshare: ConnectionState;
  localAi: ConnectionState;
  playback: boolean;
  profile?: ProfileDraft;
}

export interface LocalAiResult {
  ok: boolean;
  message: string;
  model?: string;
  runtime?: string;
}

export interface PlaybackStartResult {
  ok: true;
  eventId: string;
  library: LibraryResponse;
  playback: PlaybackGrantContract;
}

export interface PlaybackPrepareResult {
  ok: true;
  playback: PlaybackGrantContract;
}

export interface PlaybackCheckResult {
  ok: true;
}

export interface StreamerApi {
  getSetupStatus(): Promise<SetupStatus>;
  connectTmdb(token: string): Promise<ConnectionResult>;
  connectWebshare(
    username: string,
    password: string,
  ): Promise<ConnectionResult>;
  detectLocalAi(): Promise<LocalAiResult>;
  completeSetup(request: CompleteSetupRequest): Promise<void>;
  getHome(profileId: string): Promise<HomeFeed>;
  discover(request: DiscoveryRequest): Promise<DiscoveryResponse>;
  getLibrary(profileId: string): Promise<LibraryResponse>;
  addToLibrary(profileId: string, titleId: string): Promise<LibraryResponse>;
  removeFromLibrary(profileId: string, titleId: string): Promise<void>;
  getHistory(profileId: string): Promise<HistoryResponse>;
  removeHistoryEvent(profileId: string, eventId: string): Promise<void>;
  clearHistory(profileId: string): Promise<void>;
  startPlayback(
    profileId: string,
    titleId: string,
  ): Promise<PlaybackStartResult>;
  preparePlayback(
    profileId: string,
    titleId: string,
  ): Promise<PlaybackPrepareResult>;
  checkPlayback(
    profileId: string,
    titleId: string,
  ): Promise<PlaybackCheckResult>;
  getPlaybackManifest(grantId: string): Promise<PlaybackMediaInfo>;
  closePlayback(grantId: string): Promise<void>;
  savePlaybackProgress(grantId: string, progressPercent: number): Promise<void>;
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const domainErrorMessages: Record<string, string> = {
  TITLE_NOT_FOUND:
    "This title is no longer in the validated local cache. Search for it again.",
  TITLE_NOT_PLAYABLE:
    "No verified playable version is available for this title right now.",
  PLAYBACK_NOT_CONFIGURED:
    "Connect a streaming source before starting playback.",
  PLAYBACK_RECHECK_FAILED:
    "Sorry, this title is currently unavailable. Try checking again in a moment.",
  PLAYBACK_GRANT_EXPIRED:
    "The playback session expired. Press Play on the title to start again.",
  PLAYBACK_MEDIA_UNAVAILABLE:
    "This video could not be opened. Try another title or stream later.",
  PROFILE_NOT_FOUND:
    "This profile is not available. Finish setup or choose another profile.",
  HISTORY_EVENT_NOT_FOUND: "That history item no longer exists.",
  IDEMPOTENCY_CONFLICT:
    "This request conflicts with an earlier discovery request. Please send it again.",
  DISCOVERY_SESSION_NOT_FOUND:
    "This conversation has expired. Start a new discovery request.",
  INTEGRATION_NOT_CONFIGURED:
    "Finish configuring the required integration and try again.",
  INVALID_REQUEST:
    "Some information is missing or invalid. Check it and try again.",
  RATE_LIMITED: "The provider is busy. Wait a moment and try again.",
};

async function readPublicErrorCode(
  response: Response,
): Promise<string | undefined> {
  const value: unknown = await response.json().catch(() => undefined);
  if (!isRecord(value) || !isRecord(value.error)) return undefined;
  return typeof value.error.code === "string" ? value.error.code : undefined;
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
    // Read only the stable domain code. Never surface upstream messages or bodies:
    // they can contain provider details or credentials.
    const code = await readPublicErrorCode(response);
    const domainMessage = code ? domainErrorMessages[code] : undefined;
    if (domainMessage) {
      throw new ApiError(domainMessage, response.status, code);
    }
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
  expectedIntegrationId: IntegrationId,
): IntegrationConnectionResult | undefined {
  if (
    !isRecord(value) ||
    value.integrationId !== expectedIntegrationId ||
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
      integrationId: expectedIntegrationId,
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
    integrationId: expectedIntegrationId,
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
  const result = readIntegrationResult(body, "tmdb");
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

async function connectWebshare(
  username: string,
  password: string,
): Promise<IntegrationConnectionResult> {
  let response: Response;
  try {
    response = await fetch("/api/v1/integrations/webshare/connect", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new ApiError(
      "The home server is unreachable. Check that StreamerAI is running.",
    );
  }
  const body: unknown = await response.json().catch(() => undefined);
  const result = readIntegrationResult(body, "webshare");
  if (result) return result;
  throw new ApiError(
    response.status === 401
      ? "Webshare did not accept these credentials. Check them and try again."
      : "The Webshare connection could not be completed. Please try again.",
    response.status,
  );
}

interface SetupStatusResponse {
  complete: boolean;
  requiredSteps: string[];
  profile: unknown;
  integrations: {
    tmdb?: { configured?: boolean; status?: string };
    webshare?: { configured?: boolean; status?: string };
    localAi?: { enabled?: boolean; configured?: boolean; status?: string };
  };
  capabilities?: { playback?: boolean };
}

function readProfile(value: unknown): ProfileDraft | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.name !== "string" ||
    !["en", "cs", "de"].includes(String(value.locale)) ||
    !Array.isArray(value.preferences) ||
    !value.preferences.every((preference) => typeof preference === "string")
  ) {
    return undefined;
  }
  return {
    name: value.name,
    locale: value.locale as ProfileDraft["locale"],
    preferences: value.preferences,
  };
}

export const apiClient: StreamerApi = {
  getSetupStatus: async () => {
    const status = await request<SetupStatusResponse>("/setup/status");
    const complete = status.complete;
    const tmdbIntegration = status.integrations.tmdb;
    const tmdbConnected =
      tmdbIntegration?.configured === true ||
      tmdbIntegration?.status === "connected" ||
      (!status.requiredSteps.includes("connect_tmdb") && complete);
    const localAi = status.integrations.localAi;
    const webshare = status.integrations.webshare;
    const localAiConnected =
      localAi?.enabled === true &&
      ["connected", "ready", "available"].includes(localAi.status ?? "ready");
    const profile = readProfile(status.profile);
    return {
      complete,
      tmdb: tmdbConnected ? "connected" : "not-configured",
      webshare:
        webshare?.configured === true || webshare?.status === "connected"
          ? "connected"
          : "not-configured",
      localAi: localAiConnected ? "connected" : "not-configured",
      playback: status.capabilities?.playback === true,
      ...(profile ? { profile } : {}),
    };
  },
  connectTmdb,
  connectWebshare,
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
  removeHistoryEvent: (profileId, eventId) =>
    request<void>(
      `/profiles/${encodeURIComponent(profileId)}/history/${encodeURIComponent(eventId)}`,
      { method: "DELETE" },
    ),
  clearHistory: (profileId) =>
    request<void>(`/profiles/${encodeURIComponent(profileId)}/history/clear`, {
      method: "POST",
      body: JSON.stringify({ confirmationToken: "clear-history" }),
    }),
  startPlayback: (profileId, titleId) =>
    request<PlaybackStartResult>(
      `/profiles/${encodeURIComponent(profileId)}/playback/start`,
      { method: "POST", body: JSON.stringify({ titleId }) },
    ),
  preparePlayback: (profileId, titleId) =>
    request<PlaybackPrepareResult>(
      `/profiles/${encodeURIComponent(profileId)}/playback/prepare`,
      { method: "POST", body: JSON.stringify({ titleId }) },
    ),
  checkPlayback: (profileId, titleId) =>
    request<PlaybackCheckResult>(
      `/profiles/${encodeURIComponent(profileId)}/playback/check`,
      { method: "POST", body: JSON.stringify({ titleId }) },
    ),
  getPlaybackManifest: (grantId) =>
    request<PlaybackMediaInfo>(
      `/playback/grants/${encodeURIComponent(grantId)}/manifest`,
    ),
  closePlayback: (grantId) =>
    request<void>(`/playback/grants/${encodeURIComponent(grantId)}`, {
      method: "DELETE",
    }),
  savePlaybackProgress: (grantId, progressPercent) =>
    request<void>(`/playback/grants/${encodeURIComponent(grantId)}/progress`, {
      method: "POST",
      body: JSON.stringify({ progressPercent }),
    }),
};

export function safeErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Something unexpected happened. No credentials were logged; please try again.";
}
