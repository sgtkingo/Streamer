export const TMDB_CONFIGURATION_URL =
  "https://api.themoviedb.org/3/configuration";
export const TMDB_READ_TOKEN_SECRET_KEY = "integration.tmdb.read-token";

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface FetchOptionsLike {
  method: "GET";
  headers: Record<string, string>;
  signal: AbortSignal;
}

export type FetchLike = (
  url: string,
  options: FetchOptionsLike,
) => Promise<FetchResponseLike>;

export type TmdbConnectionCheck =
  | {
      ok: true;
      checkedAt: string;
    }
  | {
      ok: false;
      checkedAt: string;
      kind:
        | "unauthorized"
        | "forbidden"
        | "rate_limited"
        | "timeout"
        | "network"
        | "upstream"
        | "invalid_response";
      retryable: boolean;
    };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Only validates the small stable subset Streamer needs from TMDB configuration. */
function isTmdbConfiguration(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const configuration = value as Record<string, unknown>;
  if (typeof configuration.images !== "object" || configuration.images === null) {
    return false;
  }

  const images = configuration.images as Record<string, unknown>;
  return (
    typeof images.secure_base_url === "string" &&
    images.secure_base_url.startsWith("https://") &&
    isStringArray(images.poster_sizes) &&
    isStringArray(images.backdrop_sizes) &&
    isStringArray(configuration.change_keys)
  );
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

export interface CheckTmdbConnectionOptions {
  token: string;
  fetch: FetchLike;
  timeoutMs: number;
  now: () => Date;
}

export async function checkTmdbConnection({
  token,
  fetch,
  timeoutMs,
  now,
}: CheckTmdbConnectionOptions): Promise<TmdbConnectionCheck> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(TMDB_CONFIGURATION_URL, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    const checkedAt = now().toISOString();

    if (response.status === 401) {
      return { ok: false, checkedAt, kind: "unauthorized", retryable: false };
    }
    if (response.status === 403) {
      return { ok: false, checkedAt, kind: "forbidden", retryable: false };
    }
    if (response.status === 429) {
      return { ok: false, checkedAt, kind: "rate_limited", retryable: true };
    }
    if (!response.ok) {
      return { ok: false, checkedAt, kind: "upstream", retryable: true };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return {
        ok: false,
        checkedAt,
        kind: "invalid_response",
        retryable: true,
      };
    }

    if (!isTmdbConfiguration(payload)) {
      return {
        ok: false,
        checkedAt,
        kind: "invalid_response",
        retryable: true,
      };
    }

    return { ok: true, checkedAt };
  } catch (error) {
    const checkedAt = now().toISOString();
    if (controller.signal.aborted || isAbortError(error)) {
      return { ok: false, checkedAt, kind: "timeout", retryable: true };
    }
    return { ok: false, checkedAt, kind: "network", retryable: true };
  } finally {
    clearTimeout(timeout);
  }
}
