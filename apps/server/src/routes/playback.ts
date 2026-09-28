import type { FastifyInstance } from "fastify";
import type { PlaybackTicketStore } from "../services/playback-ticket-store.js";

export function registerPlaybackRoutes(
  app: FastifyInstance,
  ticketStore: PlaybackTicketStore,
): void {
  const paramsSchema = {
    type: "object",
    required: ["grantId"],
    additionalProperties: false,
    properties: {
      grantId: {
        type: "string",
        minLength: 1,
        maxLength: 160,
        pattern: "^[A-Za-z0-9_-]+$",
      },
    },
  } as const;

  app.get(
    "/api/v1/playback/grants/:grantId",
    { schema: { params: paramsSchema } },
    async (request, reply) => {
      const { grantId } = request.params as { grantId: string };
      const ticket = ticketStore.get(grantId);
      if (ticket === null) {
        return reply.code(404).send({
          error: {
            code: "PLAYBACK_GRANT_EXPIRED",
            message: "The playback grant is missing or expired.",
          },
        });
      }
      return reply
        .header("cache-control", "no-store, private")
        .header("referrer-policy", "no-referrer")
        .redirect(ticket.directUrl, 302);
    },
  );

  app.delete(
    "/api/v1/playback/grants/:grantId",
    { schema: { params: paramsSchema } },
    async (request, reply) => {
      const { grantId } = request.params as { grantId: string };
      ticketStore.revoke(grantId);
      return reply.code(204).send();
    },
  );
}
