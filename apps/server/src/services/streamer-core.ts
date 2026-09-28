import {
  CatalogTitleSchema,
  DiscoveryRequestSchema,
  DiscoveryResponseSchema,
  HistoryResponseSchema,
  LibraryResponseSchema,
  type CatalogTitle,
  type DiscoveryRequest,
  type DiscoveryResponse,
  type HistoryResponse,
  type HomeFeed,
  type LibraryResponse,
} from "@streamer-ai/contracts";
import type { StreamerDatabase } from "@streamer-ai/database";
import { randomUUID } from "node:crypto";
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
  }

  ensureProfile(profileId: string, name = "Viewer"): void {
    if (this.database.profiles.get(profileId) === null) {
      this.database.profiles.create({
        id: profileId,
        name,
        locale: "en",
        preferences: {},
      });
    }
  }

  configureProfile(input: {
    id: string;
    name: string;
    locale: "en" | "cs" | "de";
    preferences: string[];
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
  }

  home(profileId: string): HomeFeed {
    this.ensureProfile(profileId);
    const titles = this.contentProvider
      .bootstrapTitles()
      .map((item) => this.decorateTitle(profileId, item));
    return this.contentProvider.buildHome({
      profileId,
      generatedAt: this.now().toISOString(),
      titles,
    });
  }

  async discover(rawRequest: DiscoveryRequest): Promise<DiscoveryResponse> {
    const request = DiscoveryRequestSchema.parse(rawRequest);
    this.ensureProfile(request.profileId);
    const providerResult = DiscoveryResponseSchema.parse(
      await this.contentProvider.discover(request, this.now().toISOString()),
    );

    const ranked = [
      ...(providerResult.bestMatch === null ? [] : [providerResult.bestMatch]),
      ...providerResult.available,
      ...providerResult.unavailable,
    ];
    for (const item of ranked) {
      this.database.titles.upsert(storageTitle(item.title));
    }

    const decorateRanked = (item: (typeof ranked)[number]) => ({
      ...item,
      title: this.decorateTitle(request.profileId, item.title),
    });
    return DiscoveryResponseSchema.parse({
      ...providerResult,
      bestMatch:
        providerResult.bestMatch === null
          ? null
          : decorateRanked(providerResult.bestMatch),
      available: providerResult.available.map(decorateRanked),
      unavailable: providerResult.unavailable.map(decorateRanked),
    });
  }

  library(profileId: string): LibraryResponse {
    this.ensureProfile(profileId);
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
    this.ensureProfile(profileId);
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
    this.ensureProfile(profileId);
    return this.database.library.remove(profileId, titleId);
  }

  startPlayback(
    profileId: string,
    titleId: string,
  ): { eventId: string; library: LibraryResponse } {
    this.ensureProfile(profileId);
    const item = this.database.titles.get(titleId);
    if (item === null) throw new UnknownTitleError(titleId);
    if (item.availability !== "available" && item.availability !== "partial") {
      throw new UnplayableTitleError(titleId);
    }
    const now = this.now().toISOString();
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
    return { eventId, library: this.library(profileId) };
  }

  history(profileId: string): HistoryResponse {
    this.ensureProfile(profileId);
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

  private decorateTitle(profileId: string, item: CatalogTitle): CatalogTitle {
    const entry = this.database.library.get(profileId, item.id);
    return CatalogTitleSchema.parse({
      ...item,
      inLibrary: entry !== null,
      progressPercent: entry?.progressPercent ?? item.progressPercent,
    });
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
