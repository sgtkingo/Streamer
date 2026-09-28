import {
  CompleteSetupRequestSchema,
  DiscoveryRequestSchema,
} from "@streamer-ai/contracts";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  StreamerCore,
  UnknownTitleError,
  UnplayableTitleError,
} from "../services/streamer-core.js";

interface ContentRouteDependencies {
  core: StreamerCore;
}

const profileParamsSchema = {
  type: "object",
  required: ["profileId"],
  properties: { profileId: { type: "string", minLength: 1, maxLength: 120 } },
} as const;

const titleParamsSchema = {
  type: "object",
  required: ["profileId", "titleId"],
  properties: {
    profileId: { type: "string", minLength: 1, maxLength: 120 },
    titleId: { type: "string", minLength: 1, maxLength: 160 },
  },
} as const;

function sendDomainError(reply: FastifyReply, error: unknown) {
  if (error instanceof UnknownTitleError) {
    return reply.code(404).send({
      error: {
        code: "TITLE_NOT_FOUND",
        message: "The title is not in the validated local cache.",
      },
    });
  }
  if (error instanceof UnplayableTitleError) {
    return reply.code(409).send({
      error: {
        code: "TITLE_NOT_PLAYABLE",
        message: "No verified playable variant is available.",
      },
    });
  }
  throw error;
}

export function registerContentRoutes(
  app: FastifyInstance,
  dependencies: ContentRouteDependencies,
): void {
  app.get(
    "/api/v1/home",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            profileId: { type: "string", minLength: 1, maxLength: 120 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const query = request.query as { profileId?: string };
      return dependencies.core.home(query.profileId ?? "default");
    },
  );

  app.post(
    "/api/v1/discovery/sessions",
    {
      schema: {
        body: {
          type: "object",
          required: ["profileId", "message", "idempotencyKey"],
          additionalProperties: false,
          properties: {
            profileId: { type: "string", minLength: 1, maxLength: 120 },
            message: { type: "string", minLength: 2, maxLength: 2_000 },
            sessionId: { type: "string", minLength: 1, maxLength: 120 },
            idempotencyKey: { type: "string", minLength: 8, maxLength: 120 },
          },
        },
      },
    },
    async (request) =>
      dependencies.core.discover(DiscoveryRequestSchema.parse(request.body)),
  );

  app.get(
    "/api/v1/profiles/:profileId/library",
    { schema: { params: profileParamsSchema } },
    async (request) =>
      dependencies.core.library(
        (request.params as { profileId: string }).profileId,
      ),
  );

  app.put(
    "/api/v1/profiles/:profileId/library/:titleId",
    { schema: { params: titleParamsSchema } },
    async (request, reply) => {
      const params = request.params as { profileId: string; titleId: string };
      try {
        return dependencies.core.addToLibrary(params.profileId, params.titleId);
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );

  app.delete(
    "/api/v1/profiles/:profileId/library/:titleId",
    { schema: { params: titleParamsSchema } },
    async (request, reply) => {
      const params = request.params as { profileId: string; titleId: string };
      dependencies.core.removeFromLibrary(params.profileId, params.titleId);
      return reply.code(204).send();
    },
  );

  app.get(
    "/api/v1/profiles/:profileId/history",
    { schema: { params: profileParamsSchema } },
    async (request) =>
      dependencies.core.history(
        (request.params as { profileId: string }).profileId,
      ),
  );

  app.post(
    "/api/v1/profiles/:profileId/playback/start",
    {
      schema: {
        params: profileParamsSchema,
        body: {
          type: "object",
          required: ["titleId"],
          additionalProperties: false,
          properties: {
            titleId: { type: "string", minLength: 1, maxLength: 160 },
          },
        },
      },
    },
    async (request, reply) => {
      const { profileId } = request.params as { profileId: string };
      const { titleId } = request.body as { titleId: string };
      try {
        const result = dependencies.core.startPlayback(profileId, titleId);
        return { ok: true, eventId: result.eventId, library: result.library };
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );

  app.post("/api/v1/setup/complete", async (request, reply) => {
    const parsed = CompleteSetupRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "The setup profile is incomplete.",
        },
      });
    }
    dependencies.core.configureProfile({
      id: "default",
      ...parsed.data.profile,
    });
    return reply.code(204).send();
  });
}
