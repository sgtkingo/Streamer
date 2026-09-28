import { z } from "zod";

export const MEDIA_KINDS = ["movie", "series"] as const;
export const MediaKindSchema = z.enum(MEDIA_KINDS);
export type MediaKind = z.infer<typeof MediaKindSchema>;

export const AVAILABILITY_STATES = [
  "available",
  "partial",
  "unavailable",
  "unknown",
] as const;
export const AvailabilityStateSchema = z.enum(AVAILABILITY_STATES);
export type AvailabilityState = z.infer<typeof AvailabilityStateSchema>;

export const SourceRatingSchema = z
  .object({
    source: z.string().trim().min(1).max(60),
    value: z.number().min(0),
    scale: z.number().positive(),
    votes: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type SourceRating = z.infer<typeof SourceRatingSchema>;

export const MediaFormatSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    container: z.string().trim().min(1).max(24).nullable(),
    resolution: z.string().trim().min(1).max(24).nullable(),
    videoCodec: z.string().trim().min(1).max(32).nullable(),
    audioLanguages: z.array(z.string().trim().min(2).max(16)).max(12),
    subtitleLanguages: z.array(z.string().trim().min(2).max(16)).max(12),
  })
  .strict();
export type MediaFormat = z.infer<typeof MediaFormatSchema>;

export const SeriesCoverageSchema = z
  .object({
    seasonsAvailable: z.number().int().nonnegative(),
    seasonsTotal: z.number().int().nonnegative(),
    episodesAvailable: z.number().int().nonnegative(),
    episodesTotal: z.number().int().nonnegative(),
    complete: z.boolean(),
    nextEpisodeLabel: z.string().trim().min(1).max(80).nullable(),
  })
  .strict()
  .superRefine((coverage, context) => {
    if (
      coverage.seasonsAvailable > coverage.seasonsTotal ||
      coverage.episodesAvailable > coverage.episodesTotal
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Available series coverage cannot exceed the expected structure.",
      });
    }
    const actuallyComplete =
      coverage.seasonsTotal > 0 &&
      coverage.episodesTotal > 0 &&
      coverage.seasonsAvailable === coverage.seasonsTotal &&
      coverage.episodesAvailable === coverage.episodesTotal;
    if (coverage.complete !== actuallyComplete) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Series completeness must match verified season and episode coverage.",
      });
    }
  });
export type SeriesCoverage = z.infer<typeof SeriesCoverageSchema>;

export const CatalogTitleSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    kind: MediaKindSchema,
    title: z.string().trim().min(1).max(240),
    originalTitle: z.string().trim().min(1).max(240).nullable(),
    year: z.number().int().min(1870).max(2200).nullable(),
    synopsis: z.string().trim().max(1_500),
    posterUrl: z.string().url().nullable(),
    backdropUrl: z.string().url().nullable(),
    accentColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    genres: z.array(z.string().trim().min(1).max(60)).max(20),
    ratings: z.array(SourceRatingSchema).max(12),
    matchPercent: z.number().int().min(0).max(100).nullable(),
    availability: AvailabilityStateSchema,
    availabilityProvider: z.string().trim().min(1).max(80).nullable(),
    availabilityCheckedAt: z.string().datetime({ offset: true }).nullable(),
    formats: z.array(MediaFormatSchema).max(24),
    seriesCoverage: SeriesCoverageSchema.nullable(),
    metadataProvider: z.string().trim().min(1).max(80),
    metadataValidatedAt: z.string().datetime({ offset: true }),
    inLibrary: z.boolean(),
    progressPercent: z.number().min(0).max(100).nullable(),
  })
  .strict()
  .superRefine((title, context) => {
    if (title.kind === "movie" && title.seriesCoverage !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Movies cannot contain series coverage.",
      });
    }
    if (title.availability === "available" && title.formats.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Available titles require at least one verified format.",
      });
    }
  });
export type CatalogTitle = z.infer<typeof CatalogTitleSchema>;

export const HOME_SECTION_IDS = [
  "continue-watching",
  "new-releases",
  "trending",
  "top-rated",
  "for-you",
] as const;
export const HomeSectionIdSchema = z.enum(HOME_SECTION_IDS);
export type HomeSectionId = z.infer<typeof HomeSectionIdSchema>;

export const HomeSectionSchema = z
  .object({
    id: HomeSectionIdSchema,
    title: z.string().trim().min(1).max(80),
    subtitle: z.string().trim().max(160),
    freshness: z.enum(["fresh", "refreshing", "stale"]),
    items: z.array(CatalogTitleSchema).max(30),
  })
  .strict();
export type HomeSection = z.infer<typeof HomeSectionSchema>;

export const HomeFeedSchema = z
  .object({
    profileId: z.string().trim().min(1).max(120),
    mode: z.enum(["live", "preview"]),
    generatedAt: z.string().datetime({ offset: true }),
    sections: z.array(HomeSectionSchema).max(HOME_SECTION_IDS.length),
  })
  .strict();
export type HomeFeed = z.infer<typeof HomeFeedSchema>;

export const DISCOVERY_STAGES = [
  "understanding",
  "finding-candidates",
  "validating-metadata",
  "checking-availability",
  "ranking",
  "completed",
  "needs-setup",
  "failed",
] as const;
export const DiscoveryStageSchema = z.enum(DISCOVERY_STAGES);
export type DiscoveryStage = z.infer<typeof DiscoveryStageSchema>;

export const DiscoveryRequestSchema = z
  .object({
    profileId: z.string().trim().min(1).max(120),
    message: z.string().trim().min(2).max(2_000),
    sessionId: z.string().trim().min(1).max(120).optional(),
    idempotencyKey: z.string().trim().min(8).max(120),
  })
  .strict();
export type DiscoveryRequest = z.infer<typeof DiscoveryRequestSchema>;

const RankedTitleSchema = z
  .object({
    title: CatalogTitleSchema,
    reason: z.string().trim().min(1).max(320),
  })
  .strict();
export type RankedTitle = z.infer<typeof RankedTitleSchema>;

export const DiscoveryResponseSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(120),
    stage: DiscoveryStageSchema,
    reply: z.string().trim().min(1).max(1_000),
    bestMatch: RankedTitleSchema.nullable(),
    available: z.array(RankedTitleSchema).max(30),
    unavailable: z.array(RankedTitleSchema).max(30),
    warnings: z.array(z.string().trim().min(1).max(240)).max(20),
    completedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((result, context) => {
    if (
      result.bestMatch !== null &&
      !["available", "partial"].includes(result.bestMatch.title.availability)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The best match must be streamable.",
      });
    }
    const ids = [
      ...(result.bestMatch === null ? [] : [result.bestMatch.title.id]),
      ...result.available.map((item) => item.title.id),
      ...result.unavailable.map((item) => item.title.id),
    ];
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Discovery groups cannot contain duplicates.",
      });
    }
  });
export type DiscoveryResponse = z.infer<typeof DiscoveryResponseSchema>;

export const LIBRARY_STATES = ["saved", "in-progress", "completed"] as const;
export const LibraryStateSchema = z.enum(LIBRARY_STATES);
export type LibraryState = z.infer<typeof LibraryStateSchema>;

export const LibraryEntrySchema = z
  .object({
    title: CatalogTitleSchema,
    state: LibraryStateSchema,
    membershipReason: z.enum(["explicit", "playback"]),
    addedAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    lastPlayedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type LibraryEntry = z.infer<typeof LibraryEntrySchema>;

export const LibraryResponseSchema = z
  .object({
    profileId: z.string().trim().min(1).max(120),
    items: z.array(LibraryEntrySchema),
  })
  .strict();
export type LibraryResponse = z.infer<typeof LibraryResponseSchema>;

export const HistoryEventSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    title: CatalogTitleSchema,
    episodeLabel: z.string().trim().min(1).max(120).nullable(),
    occurredAt: z.string().datetime({ offset: true }),
    progressPercent: z.number().min(0).max(100),
    completed: z.boolean(),
  })
  .strict();
export type HistoryEvent = z.infer<typeof HistoryEventSchema>;

export const HistoryResponseSchema = z
  .object({
    profileId: z.string().trim().min(1).max(120),
    items: z.array(HistoryEventSchema),
  })
  .strict();
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

/** Provider-neutral boundaries. Concrete TMDB, Webshare or future adapters implement these contracts. */
export interface MetadataProvider {
  readonly id: string;
  getHomeFeed(profileId: string): Promise<HomeFeed>;
}

export interface MediaProvider {
  readonly id: string;
  recheck(
    titleId: string,
  ): Promise<
    Pick<CatalogTitle, "availability" | "availabilityCheckedAt" | "formats">
  >;
}

export interface SubtitleProvider {
  readonly id: string;
  readonly enabled: boolean;
}

export interface SearchProvider {
  readonly id: string;
  readonly enabled: boolean;
}

export interface AgentProvider {
  readonly id: string;
  discover(request: DiscoveryRequest): Promise<DiscoveryResponse>;
}

export interface SyncProvider {
  readonly id: string;
  readonly enabled: boolean;
}
