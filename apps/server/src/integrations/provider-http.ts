export type ProviderFailureKind =
  | "not-configured"
  | "unauthorized"
  | "forbidden"
  | "rate-limited"
  | "timeout"
  | "network"
  | "upstream"
  | "invalid-response";

export class ProviderRequestError extends Error {
  constructor(
    readonly providerId: string,
    readonly kind: ProviderFailureKind,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(`${providerId} request failed (${kind}).`);
    this.name = "ProviderRequestError";
  }
}

export function providerFailureForStatus(
  providerId: string,
  status: number,
): ProviderRequestError {
  if (status === 401)
    return new ProviderRequestError(providerId, "unauthorized", false, status);
  if (status === 403)
    return new ProviderRequestError(providerId, "forbidden", false, status);
  if (status === 429)
    return new ProviderRequestError(providerId, "rate-limited", true, status);
  return new ProviderRequestError(
    providerId,
    "upstream",
    status >= 500,
    status,
  );
}

export function isAbortFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
