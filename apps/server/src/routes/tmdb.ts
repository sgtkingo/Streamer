import type { FastifyInstance, FastifyReply } from "fastify";
import {
  checkTmdbConnection,
  TMDB_READ_TOKEN_SECRET_KEY,
  type FetchLike,
  type TmdbConnectionCheck,
} from "../integrations/tmdb-client.js";
import type { IntegrationStateStore } from "../stores/integration-state-store.js";
import type { SecretStore } from "../stores/secret-store.js";

export interface TmdbRouteDependencies {
  fetch: FetchLike;
  secretStore: SecretStore;
  integrationStateStore: IntegrationStateStore;
  timeoutMs: number;
  now: () => Date;
}

const authorizationHeadersSchema = {
  type: "object",
  required: ["authorization"],
  properties: {
    authorization: { type: "string", minLength: 8, maxLength: 4096 },
  },
} as const;

function readBearerToken(authorization: string | undefined): string | undefined {
  if (authorization === undefined) {
    return undefined;
  }

  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (match === null) {
    return undefined;
  }

  const token = match[1];
  return token !== undefined && token.length >= 20 && token.length <= 2048
    ? token
    : undefined;
}

function sendCheckFailure(reply: FastifyReply, result: TmdbConnectionCheck) {
  if (result.ok) {
    throw new Error("Expected a failed TMDB connection check");
  }

  if (result.kind === "unauthorized" || result.kind === "forbidden") {
    return reply.code(401).send({
      integrationId: "tmdb",
      status: "action_required",
      saved: false,
      diagnostic: {
        code: "TMDB_TOKEN_REJECTED",
        message:
          "TMDB rejected this token. Copy the API Read Access Token from your TMDB API settings and try again.",
        retryable: false,
      },
      checkedAt: result.checkedAt,
    });
  }

  if (result.kind === "timeout") {
    return reply.code(504).send({
      integrationId: "tmdb",
      status: "unavailable",
      saved: false,
      diagnostic: {
        code: "TMDB_TIMEOUT",
        message:
          "TMDB did not respond in time. Your token was not saved; check the connection and try again.",
        retryable: true,
      },
      checkedAt: result.checkedAt,
    });
  }

  const code =
    result.kind === "rate_limited"
      ? "TMDB_RATE_LIMITED"
      : result.kind === "invalid_response"
        ? "TMDB_INVALID_RESPONSE"
        : "TMDB_UNAVAILABLE";
  const message =
    result.kind === "rate_limited"
      ? "TMDB is temporarily limiting requests. Wait a moment and try again."
      : "TMDB could not be verified right now. Your token was not saved; try again later.";

  return reply.code(502).send({
    integrationId: "tmdb",
    status: "unavailable",
    saved: false,
    diagnostic: { code, message, retryable: true },
    checkedAt: result.checkedAt,
  });
}

async function verify(
  authorization: string | undefined,
  dependencies: TmdbRouteDependencies,
) {
  const token = readBearerToken(authorization);
  if (token === undefined) {
    return { token: undefined, result: undefined } as const;
  }

  const result = await checkTmdbConnection({
    token,
    fetch: dependencies.fetch,
    timeoutMs: dependencies.timeoutMs,
    now: dependencies.now,
  });
  return { token, result } as const;
}

export function registerTmdbRoutes(
  app: FastifyInstance,
  dependencies: TmdbRouteDependencies,
): void {
  app.post(
    "/api/v1/integrations/tmdb/check",
    { schema: { headers: authorizationHeadersSchema } },
    async (request, reply) => {
      const verification = await verify(
        request.headers.authorization,
        dependencies,
      );
      if (verification.token === undefined || verification.result === undefined) {
        return reply.code(400).send({
          integrationId: "tmdb",
          status: "action_required",
          saved: false,
          diagnostic: {
            code: "TMDB_TOKEN_REQUIRED",
            message:
              "Paste a valid TMDB API Read Access Token and try again.",
            retryable: false,
          },
        });
      }
      if (!verification.result.ok) {
        request.log.info(
          { integrationId: "tmdb", code: verification.result.kind },
          "TMDB connection check did not succeed",
        );
        return sendCheckFailure(reply, verification.result);
      }

      return reply.send({
        integrationId: "tmdb",
        status: "verified",
        saved: false,
        persistence: "not_saved",
        message:
          "TMDB accepted the token. Continue to connect it and enable metadata.",
        checkedAt: verification.result.checkedAt,
      });
    },
  );

  app.post(
    "/api/v1/integrations/tmdb/connect",
    { schema: { headers: authorizationHeadersSchema } },
    async (request, reply) => {
      const verification = await verify(
        request.headers.authorization,
        dependencies,
      );
      if (verification.token === undefined || verification.result === undefined) {
        return reply.code(400).send({
          integrationId: "tmdb",
          status: "action_required",
          saved: false,
          diagnostic: {
            code: "TMDB_TOKEN_REQUIRED",
            message:
              "Paste a valid TMDB API Read Access Token and try again.",
            retryable: false,
          },
        });
      }
      if (!verification.result.ok) {
        request.log.info(
          { integrationId: "tmdb", code: verification.result.kind },
          "TMDB connection check did not succeed",
        );
        return sendCheckFailure(reply, verification.result);
      }

      const previousToken = await dependencies.secretStore.get(
        TMDB_READ_TOKEN_SECRET_KEY,
      );
      try {
        await dependencies.secretStore.set(
          TMDB_READ_TOKEN_SECRET_KEY,
          verification.token,
        );
        await dependencies.integrationStateStore.set({
          integrationId: "tmdb",
          status: "connected",
          configured: true,
          checkedAt: verification.result.checkedAt,
          updatedAt: dependencies.now().toISOString(),
        });
      } catch {
        try {
          if (previousToken === undefined) {
            await dependencies.secretStore.delete(TMDB_READ_TOKEN_SECRET_KEY);
          } else {
            await dependencies.secretStore.set(
              TMDB_READ_TOKEN_SECRET_KEY,
              previousToken,
            );
          }
        } catch {
          // The response remains sanitized. Readiness diagnostics expose the
          // store failure without ever emitting a secret value.
        }

        request.log.error(
          { integrationId: "tmdb", code: "INTEGRATION_STORAGE_FAILED" },
          "Could not save TMDB integration state",
        );
        return reply.code(500).send({
          integrationId: "tmdb",
          status: "unavailable",
          saved: false,
          diagnostic: {
            code: "INTEGRATION_STORAGE_FAILED",
            message:
              "The token was verified but could not be saved. Check local storage and try again.",
            retryable: true,
          },
        });
      }

      return reply.send({
        integrationId: "tmdb",
        status: "connected",
        saved: true,
        persistence: dependencies.secretStore.persistence,
        message: "TMDB is connected. Metadata and discovery can now start.",
        checkedAt: verification.result.checkedAt,
      });
    },
  );
}
