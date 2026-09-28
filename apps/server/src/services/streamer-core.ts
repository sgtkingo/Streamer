import {
  CatalogTitleSchema,
  DiscoveryRequestSchema,
  DiscoveryResponseSchema,
  HistoryResponseSchema,
  LibraryResponseSchema,
  PlaybackGrantSchema,
  type CatalogTitle,
  type DiscoveryRequest,
  type DiscoveryResponse,
  type HistoryResponse,
  type HomeFeed,
  type LibraryResponse,
  type PlaybackGrant,
} from "@streamer-ai/contracts";
import type { StreamerDatabase } from "@streamer-ai/database";
import { createHash, randomUUID } from "node:crypto";
import {
  PreviewContentProvider,
  type StreamerContentProvider,
} from "./content-provider.js";

function storageTitle(item: CatalogTitle) {
  const {
    inLibrary: _inLibrary,
    matchPercent: _matchPercent,
    progressPercent: _progressPercent,
    ...stored
  } = item;
  return stored;
}

function discoveryRequestHash(request: DiscoveryRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        profileId: request.profileId,
        sessionId: request.sessionId ?? null,
        message: request.message,
      }),
    )
    .digest("hex");
}

/**
 * Application service over provider-neutral records. Provider orchestration is
 * injected, so Library and History do not depend on TMDB, Webshare or any
 * particular agent implementation.
 */
export class StreamerCore {
  constructor(
    private readonly database: StreamerDatabase,
    private readonly now: () => Date,
    private readonly contentProvider: StreamerContentProvider = new PreviewContentProvider(),
  ) {
    for (const item of contentProvider.bootstrapTitles()) {
      this.database.titles.upsert(storageTitle(item));
    }
    if (this.database.profiles.get("default") === null) {
      this.database.profiles.create({
        id: "default",
        name: "Viewer",
        locale: "en",
        preferences: {},
      });
    }
  }

  requireProfile(profileId: string): void {
    if (this.database.profiles.get(profileId) === null) {
      throw new UnknownProfileError(profileId);
    }
  }

  configureProfile(input: {
    id: string;
    name: string;
    locale: "en" | "cs" | "de";
    preferences: string[];
    localAiEnabled: boolean;
  }): void {
    const existing = this.database.profiles.get(input.id);
    const preferences = { genres: input.preferences };
    if (existing === null) {
      this.database.profiles.create({ ...input, preferences });
    } else {
      this.database.profiles.update(input.id, {
        name: input.name,
        locale: input.locale,
        preferences,
      });
    }
    this.database.settings.set("setup.completed", true);
    this.database.settings.set("setup.localAiEnabled", input.localAiEnabled);
  }

  home(profileId: string): HomeFeed {
    this.requireProfile(profileId);
    const titles = this.database.titles.list().map((stored) => {
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...data } = stored;
      return this.decorateTitle(
        profileId,
        CatalogTitleSchema.parse({
          ...data,
          inLibrary: false,
          matchPercent: null,
          progressPercent: null,
        }),
      );
    });
    return this.contentProvider.buildHome({
      profileId,
      generatedAt: this.now().toISOString(),
      titles,
    });
  }

  async discover(rawRequest: DiscoveryRequest): Promise<DiscoveryResponse> {
    const request = DiscoveryRequestSchema.parse(rawRequest);
    this.requireProfile(request.profileId);
    const scope = `discovery:${request.profileId}`;
    const requestHash = discoveryRequestHash(request);
    const claim = this.database.idempotency.claim<DiscoveryResponse>({
      scope,
      key: request.idempotencyKey,
      requestHash,
    });
    if (claim.status === "conflict") {
      throw new IdempotencyConflictError(request.idempotencyKey);
    }
    if (claim.status === "in-progress") {
      throw new RequestInProgressError(request.idempotencyKey);
    }
    if (claim.status === "replay") {
      if (
        claim.record.state === "completed" &&
        claim.record.response !== null
      ) {
        return DiscoveryResponseSchema.parse(claim.record.response);
      }
      throw new PreviousRequestFailedError(request.idempotencyKey);
    }

    try {
      const sessionId = request.sessionId ?? randomUUID();
      const existingSession = this.database.discoverySessions.get(sessionId);
      if (existingSession === null) {
        if (request.sessionId !== undefined) {
          throw new DiscoverySessionNotFoundError(sessionId);
        }
        this.database.discoverySessions.create({
          id: sessionId,
          profileId: request.profileId,
          mode: this.contentProvider.mode,
          context: {},
        });
      } else if (existingSession.profileId !== request.profileId) {
        throw new DiscoverySessionNotFoundError(sessionId);
      } else if (
        existingSession.state !== "active" ||
        existingSession.mode !== this.contentProvider.mode
      ) {
        throw new DiscoverySessionClosedError(sessionId);
      }

      this.database.discoverySessions.appendMessage({
        id: randomUUID(),
        sessionId,
        role: "user",
        content: { message: request.message },
        requestId: request.idempotencyKey,
      });

      const messages = this.database.discoverySessions.listMessages(sessionId);
      const providerResult = DiscoveryResponseSchema.parse(
        await this.contentProvider.discover(
          { ...request, sessionId },
          this.now().toISOString(),
          {
            sessionId,
            messages: messages.map((message) => ({
              role: message.role,
              content: message.content,
              createdAt: message.createdAt,
            })),
          },
        ),
      );
      if (
        providerResult.sessionId !== sessionId ||
        providerResult.mode !== this.contentProvider.mode
      ) {
        throw new Error(
          "Content provider returned a mismatched session or mode.",
        );
      }
      const ranked = [
        ...(providerResult.bestMatch === null
          ? []
          : [providerResult.bestMatch]),
        ...providerResult.available,
        ...providerResult.unavailable,
        ...providerResult.unverified,
      ];
      for (const item of ranked) {
        this.database.titles.upsert(storageTitle(item.title));
      }

      const decorateRanked = (item: (typeof ranked)[number]) => ({
        ...item,
        title: this.decorateTitle(request.profileId, item.title),
      });
      const response = DiscoveryResponseSchema.parse({
        ...providerResult,
        bestMatch:
          providerResult.bestMatch === null
            ? null
            : decorateRanked(providerResult.bestMatch),
        available: providerResult.available.map(decorateRanked),
        unavailable: providerResult.unavailable.map(decorateRanked),
        unverified: providerResult.unverified.map(decorateRanked),
      });
      this.database.transaction(() => {
        this.database.discoverySessions.appendMessage({
          id: randomUUID(),
          sessionId,
          role: "assistant",
          content: {
            reply: response.reply,
            titleIds: ranked.map((item) => item.title.id),
            stage: response.stage,
          },
          requestId: request.idempotencyKey,
        });
        this.database.idempotency.complete({
          scope,
          key: request.idempotencyKey,
          requestHash,
          response,
          statusCode: 200,
        });
      });
      return response;
    } catch (error) {
      this.failDiscoveryClaimIfPending(
        scope,
        request,
        requestHash,
        error instanceof DiscoverySessionNotFoundError
          ? "SESSION_NOT_FOUND"
          : error instanceof DiscoverySessionClosedError
            ? "SESSION_CLOSED"
            : "DISCOVERY_FAILED",
      );
      throw error;
    }
  }

  library(profileId: string): LibraryResponse {
    this.requireProfile(profileId);
    const items = this.database.library.list(profileId).flatMap((entry) => {
      const stored = this.database.titles.get(entry.titleId);
      if (stored === null) return [];
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...data } = stored;
      const title = CatalogTitleSchema.parse({
        ...data,
        inLibrary: true,
        matchPercent: null,
        progressPercent: entry.progressPercent,
      });
      return [
        {
          title,
          state: entry.state,
          membershipReason: entry.membershipReason,
          addedAt: entry.addedAt,
          updatedAt: entry.updatedAt,
          lastPlayedAt: entry.lastPlayedAt,
        },
      ];
    });
    return LibraryResponseSchema.parse({ profileId, items });
  }

  addToLibrary(profileId: string, titleId: string): LibraryResponse {
    this.requireProfile(profileId);
    if (this.database.titles.get(titleId) === null) {
      throw new UnknownTitleError(titleId);
    }
    this.database.library.upsert({
      profileId,
      titleId,
      membershipReason: "explicit",
      state: "saved",
    });
    return this.library(profileId);
  }

  removeFromLibrary(profileId: string, titleId: string): boolean {
    this.requireProfile(profileId);
    return this.database.library.remove(profileId, titleId);
  }

  async startPlayback(
    profileId: string,
    titleId: string,
  ): Promise<{
    eventId: string;
    library: LibraryResponse;
    playback: PlaybackGrant;
  }> {
    this.requireProfile(profileId);
    const item = this.database.titles.get(titleId);
    if (item === null) throw new UnknownTitleError(titleId);
    if (item.availability !== "available" && item.availability !== "partial") {
      throw new UnplayableTitleError(titleId);
    }
    if (
      this.contentProvider.mode !== "live" ||
      this.contentProvider.preparePlayback === undefined
    ) {
      throw new PlaybackNotConfiguredError();
    }
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...stored } = item;
    const title = CatalogTitleSchema.parse({
      ...stored,
      inLibrary: this.database.library.get(profileId, titleId) !== null,
      matchPercent: null,
      progressPercent:
        this.database.library.get(profileId, titleId)?.progressPercent ?? null,
    });
    const playback = PlaybackGrantSchema.parse(
      await this.contentProvider.preparePlayback(profileId, title),
    );
    const nowDate = this.now();
    if (
      playback.titleId !== titleId ||
      Date.parse(playback.expiresAt) <= nowDate.getTime()
    ) {
      throw new PlaybackRecheckError(titleId);
    }
    if (!playback.url.startsWith("/api/v1/playback/grants/")) {
      const playbackUrl = new URL(playback.url);
      const loopback = ["127.0.0.1", "localhost", "::1"].includes(
        playbackUrl.hostname,
      );
      if (playbackUrl.protocol !== "https:" && !loopback) {
        throw new PlaybackRecheckError(titleId);
      }
    }
    const now = nowDate.toISOString();
    const eventId = randomUUID();
    this.database.transaction(() => {
      this.database.library.upsert({
        profileId,
        titleId,
        membershipReason: "playback",
        state: "in-progress",
        progressPercent: 0,
        lastPlayedAt: now,
      });
      this.database.history.append({
        id: eventId,
        profileId,
        titleId,
        eventType: "start",
        episodeLabel:
          item.kind === "series"
            ? (item.seriesCoverage?.nextEpisodeLabel ?? null)
            : null,
        progressPercent: 0,
        occurredAt: now,
      });
    });
    return { eventId, library: this.library(profileId), playback };
  }

  history(profileId: string): HistoryResponse {
    this.requireProfile(profileId);
    const items = this.database.history.list(profileId).flatMap((event) => {
      const stored = this.database.titles.get(event.titleId);
      if (stored === null) return [];
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...data } = stored;
      const title = CatalogTitleSchema.parse({
        ...data,
        inLibrary: true,
        matchPercent: null,
        progressPercent: event.progressPercent,
      });
      return [
        {
          id: event.id,
          title,
          episodeLabel: event.episodeLabel,
          occurredAt: event.occurredAt,
          progressPercent: event.progressPercent,
          completed: event.eventType === "complete",
        },
      ];
    });
    return HistoryResponseSchema.parse({ profileId, items });
  }

  removeHistoryEvent(profileId: string, eventId: string): boolean {
    this.requireProfile(profileId);
    return this.database.history.remove(profileId, eventId);
  }

  clearHistory(profileId: string): number {
    this.requireProfile(profileId);
    return this.database.history.clear(profileId);
  }

  private decorateTitle(profileId: string, item: CatalogTitle): CatalogTitle {
    const entry = this.database.library.get(profileId, item.id);
    return CatalogTitleSchema.parse({
      ...item,
      inLibrary: entry !== null,
      progressPercent: entry?.progressPercent ?? null,
    });
  }

  private failDiscoveryClaim(
    scope: string,
    request: DiscoveryRequest,
    requestHash: string,
    errorCode: string,
  ): void {
    this.database.idempotency.fail({
      scope,
      key: request.idempotencyKey,
      requestHash,
      response: { errorCode },
      statusCode: 409,
      errorCode,
    });
  }

  private failDiscoveryClaimIfPending(
    scope: string,
    request: DiscoveryRequest,
    requestHash: string,
    errorCode: string,
  ): void {
    const record = this.database.idempotency.get(scope, request.idempotencyKey);
    if (record?.state === "in-progress") {
      this.failDiscoveryClaim(scope, request, requestHash, errorCode);
    }
  }
}

export class UnknownProfileError extends Error {
  constructor(readonly profileId: string) {
    super(`Unknown profile '${profileId}'.`);
    this.name = "UnknownProfileError";
  }
}

export class UnknownTitleError extends Error {
  constructor(readonly titleId: string) {
    super(`Unknown canonical title '${titleId}'.`);
    this.name = "UnknownTitleError";
  }
}

export class UnplayableTitleError extends Error {
  constructor(readonly titleId: string) {
    super(`Title '${titleId}' has no verified playable variant.`);
    this.name = "UnplayableTitleError";
  }
}

export class PlaybackNotConfiguredError extends Error {
  constructor() {
    super("A live media provider is required before playback can start.");
    this.name = "PlaybackNotConfiguredError";
  }
}

export class PlaybackRecheckError extends Error {
  constructor(readonly titleId: string) {
    super(`Playback revalidation failed for '${titleId}'.`);
    this.name = "PlaybackRecheckError";
  }
}

export class IdempotencyConflictError extends Error {
  constructor(readonly key: string) {
    super(`Idempotency key '${key}' was already used for another request.`);
    this.name = "IdempotencyConflictError";
  }
}

export class RequestInProgressError extends Error {
  constructor(readonly key: string) {
    super(`Request '${key}' is already in progress.`);
    this.name = "RequestInProgressError";
  }
}

export class PreviousRequestFailedError extends Error {
  constructor(readonly key: string) {
    super(`Request '${key}' previously failed; retry with a new key.`);
    this.name = "PreviousRequestFailedError";
  }
}

export class DiscoverySessionNotFoundError extends Error {
  constructor(readonly sessionId: string) {
    super(`Discovery session '${sessionId}' was not found.`);
    this.name = "DiscoverySessionNotFoundError";
  }
}

export class DiscoverySessionClosedError extends Error {
  constructor(readonly sessionId: string) {
    super(`Discovery session '${sessionId}' is no longer active.`);
    this.name = "DiscoverySessionClosedError";
  }
}
