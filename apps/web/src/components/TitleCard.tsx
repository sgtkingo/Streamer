import { useEffect, useMemo } from "react";
import type { CatalogTitle, PlaybackPreferences } from "@streamer-ai/contracts";
import type { EpisodeSelection } from "@streamer-ai/contracts";
import { titleLanguageLabel } from "../title-language-label";
import type { PlaybackCheckState } from "./usePlaybackChecks";

interface TitleCardProps {
  item: CatalogTitle;
  preferences: PlaybackPreferences;
  reason?: string;
  hero?: boolean;
  onPlay: (item: CatalogTitle, episode?: EpisodeSelection) => void;
  onOpen?: (item: CatalogTitle) => void;
  onCheck?: (item: CatalogTitle, episode?: EpisodeSelection) => void;
  onAdd: (item: CatalogTitle) => void;
  onRemove?: (item: CatalogTitle) => void;
  playbackEnabled?: boolean;
  pendingAction?: "play" | "add" | "remove";
  playbackCheck?: PlaybackCheckState;
}

function ratingLabel(item: CatalogTitle): string {
  const rating = item.ratings[0];
  if (!rating) return "Rating pending";
  const normalized = Math.round((rating.value / rating.scale) * 100);
  return `${rating.source} ${normalized}%`;
}

function availabilityLabel(item: CatalogTitle): string {
  if (item.availability === "available")
    return item.formats[0]?.label ?? "Playable";
  if (item.availability === "partial" && item.seriesCoverage) {
    return `${item.seriesCoverage.episodesAvailable}/${item.seriesCoverage.episodesTotal} episodes`;
  }
  if (item.availability === "unknown") return "Availability needs recheck";
  return `Not found on ${item.availabilityProvider ?? "media source"}`;
}

export function titleHasPlayableVariant(item: CatalogTitle): boolean {
  if (item.formats.length === 0) return false;
  if (item.availability === "available") return true;
  return (
    item.kind === "series" &&
    item.availability === "partial" &&
    item.seriesCoverage !== null &&
    item.seriesCoverage.episodesAvailable > 0 &&
    item.seriesCoverage.nextEpisodeLabel !== null
  );
}

export function TitleCard({
  item,
  preferences,
  reason,
  hero = false,
  onPlay,
  onOpen,
  onCheck,
  onAdd,
  onRemove,
  playbackEnabled = true,
  pendingAction,
  playbackCheck,
}: TitleCardProps) {
  const playable = titleHasPlayableVariant(item);
  const checkStatus = playbackCheck?.status ?? "checking";
  const checkedLanguages =
    playbackCheck?.status === "ready" &&
    playbackCheck.audioLanguages &&
    playbackCheck.subtitleLanguages
      ? {
          audioLanguages: playbackCheck.audioLanguages,
          subtitleLanguages: playbackCheck.subtitleLanguages,
        }
      : undefined;
  const languageLabel =
    !playbackEnabled || checkStatus === "ready"
      ? titleLanguageLabel(
          item,
          preferences,
          checkedLanguages,
          !playbackEnabled || checkedLanguages !== undefined,
        )
      : null;
  const hasSavedProgress =
    item.progressPercent !== null &&
    item.progressPercent >= 2 &&
    item.progressPercent < 95;
  const defaultEpisode = useMemo(
    () =>
      item.kind === "series"
        ? (item.resumeEpisode ?? { seasonNumber: 1, episodeNumber: 1 })
        : undefined,
    [item.kind, item.resumeEpisode],
  );
  const canShowPlayback = playbackEnabled || playable;
  const displayAvailability = playbackEnabled
    ? item.kind === "series"
      ? checkStatus === "ready"
        ? "available"
        : item.availability
      : checkStatus === "failed"
        ? "unavailable"
        : checkStatus === "ready"
          ? "available"
          : "unknown"
    : item.availability;
  const availabilityText =
    playbackEnabled && item.kind === "series"
      ? checkStatus === "checking"
        ? "Checking first episode…"
        : checkStatus === "failed"
          ? "First episode unavailable · see episodes"
          : checkStatus === "ready"
            ? `First episode ready · ${availabilityLabel(item)}`
            : availabilityLabel(item)
      : playbackEnabled
        ? checkStatus === "checking"
          ? "Checking streaming availability…"
          : checkStatus === "failed"
            ? "Sorry, currently unavailable"
            : checkStatus === "ready" &&
                item.availability !== "available" &&
                item.availability !== "partial"
              ? "Verified on streaming source"
              : availabilityLabel(item)
        : availabilityLabel(item);

  useEffect(() => {
    if (playbackEnabled && onCheck)
      onCheck(item, item.kind === "series" ? defaultEpisode : undefined);
  }, [item, onCheck, playbackEnabled, defaultEpisode]);

  const classNames = [
    "title-card",
    onOpen ? "title-card--openable" : "",
    hero ? "title-card--hero" : "",
    displayAvailability === "unavailable" ? "title-card--unavailable" : "",
    displayAvailability === "unknown" ? "title-card--unknown" : "",
    playbackEnabled && item.kind !== "series" && checkStatus === "failed"
      ? "title-card--playback-unavailable"
      : "",
    item.kind === "series" ? "title-card--series" : "",
    item.kind === "series" &&
    item.seriesCoverage &&
    !item.seriesCoverage.complete
      ? "title-card--searching"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const artwork = item.posterUrl ? (
    <img src={item.posterUrl} alt="" />
  ) : (
    <>
      <span>{item.title.slice(0, 1)}</span>
      <i />
    </>
  );

  return (
    <article
      className={classNames}
      style={{ "--card-accent": item.accentColor } as React.CSSProperties}
      aria-busy={pendingAction ? "true" : undefined}
      onClick={(event) => {
        if (
          !onOpen ||
          (event.target as HTMLElement).closest(
            "button, a, input, select, textarea",
          )
        )
          return;
        onOpen(item);
      }}
    >
      {onOpen ? (
        <button
          className="title-card__art title-card__art--button"
          type="button"
          onClick={() => onOpen(item)}
          aria-label={`Details for ${item.title}`}
        >
          {artwork}
        </button>
      ) : (
        <div className="title-card__art" aria-hidden="true">
          {artwork}
        </div>
      )}
      <div className="title-card__content">
        {hero && <p className="eyebrow title-card__label">Best match</p>}
        <div className="title-card__chips">
          <span>
            {item.kind === "series" ? "Series" : "Movie"}
            {item.year ? ` · ${item.year}` : ""}
          </span>
          <span>{ratingLabel(item)}</span>
          {item.matchPercent !== null && (
            <span>Match {item.matchPercent}%</span>
          )}
        </div>
        <h3>
          {onOpen ? (
            <button
              className="title-card__title-button"
              type="button"
              onClick={() => onOpen(item)}
              aria-label={`Details for ${item.title}`}
            >
              {item.title}
            </button>
          ) : (
            item.title
          )}
        </h3>
        {reason && <p className="title-card__reason">{reason}</p>}
        {hero && <p className="title-card__synopsis">{item.synopsis}</p>}
        <p className="title-card__availability">
          <span
            className={`availability-dot availability-dot--${playbackEnabled && item.kind !== "series" && checkStatus === "failed" ? "playback-failed" : playbackEnabled && checkStatus === "ready" ? "available" : displayAvailability}`}
            aria-hidden="true"
          />
          {availabilityText}
        </p>
        {languageLabel && (
          <p
            className={`title-card__languages${languageLabel.warning ? " title-card__languages--warning" : ""}`}
            aria-label={`Audio languages: ${languageLabel.text}${languageLabel.warning ? "; no preferred audio or subtitles" : ""}`}
          >
            {languageLabel.text}
          </p>
        )}
        {playbackEnabled &&
          item.kind !== "series" &&
          checkStatus === "failed" && (
            <p className="title-card__playback-error" role="status">
              {playbackCheck?.status === "failed"
                ? playbackCheck.message
                : "Sorry, this title is currently unavailable."}
            </p>
          )}
        {item.seriesCoverage && (
          <p className="series-coverage">
            {item.seriesCoverage.seasonsAvailable}/
            {item.seriesCoverage.seasonsTotal} seasons ·{" "}
            {item.seriesCoverage.episodesAvailable}/
            {item.seriesCoverage.episodesTotal} episodes
            {!item.seriesCoverage.complete && <span> · • searching...</span>}
          </p>
        )}
        {item.progressPercent !== null && (
          <div
            className="progress-track"
            aria-label={`${Math.round(item.progressPercent)}% watched`}
          >
            <span style={{ width: `${item.progressPercent}%` }} />
          </div>
        )}
        <div className="title-card__actions">
          {onOpen && (
            <button
              className="button button--secondary button--compact"
              type="button"
              onClick={() => onOpen(item)}
            >
              Details
            </button>
          )}
          {item.kind === "series" && onOpen ? (
            <button
              className={`button button--${checkStatus === "failed" ? "secondary" : "primary"} button--compact${checkStatus === "checking" || pendingAction === "play" ? " button--checking" : ""}`}
              type="button"
              disabled={
                pendingAction !== undefined || checkStatus === "checking"
              }
              onClick={() =>
                checkStatus === "ready"
                  ? onPlay(item, defaultEpisode)
                  : onOpen(item)
              }
            >
              {checkStatus === "checking"
                ? "Checking"
                : pendingAction === "play"
                  ? "Starting…"
                  : checkStatus === "ready"
                    ? hasSavedProgress
                      ? "Continue"
                      : "▶ Play"
                    : "Episodes"}
            </button>
          ) : (
            canShowPlayback &&
            playbackEnabled && (
              <button
                className={`button button--${checkStatus === "failed" ? "warning" : "primary"} button--compact${
                  checkStatus === "checking" || pendingAction === "play"
                    ? " button--checking"
                    : ""
                }`}
                type="button"
                onClick={() =>
                  checkStatus === "failed" ? onCheck?.(item) : onPlay(item)
                }
                disabled={
                  pendingAction !== undefined || checkStatus === "checking"
                }
              >
                {checkStatus === "checking"
                  ? "Checking"
                  : pendingAction === "play"
                    ? "Starting…"
                    : checkStatus === "failed"
                      ? "Retry check"
                      : hasSavedProgress
                        ? "Continue"
                        : "▶ Play"}
              </button>
            )
          )}
          {playable && !playbackEnabled && item.kind !== "series" && (
            <button
              className="button button--secondary button--compact"
              type="button"
              disabled
              title="Connect a streaming source to enable playback"
            >
              Streaming source required
            </button>
          )}
          {item.inLibrary ? (
            onRemove ? (
              <button
                className="button button--secondary button--compact"
                type="button"
                onClick={() => onRemove(item)}
                disabled={pendingAction !== undefined}
              >
                {pendingAction === "remove" ? "Removing…" : "Remove"}
              </button>
            ) : (
              <span className="in-library">✓ In Library</span>
            )
          ) : (
            <button
              className="button button--secondary button--compact"
              type="button"
              onClick={() => onAdd(item)}
              disabled={pendingAction !== undefined}
            >
              {pendingAction === "add" ? "Adding…" : "+ Add to Library"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
