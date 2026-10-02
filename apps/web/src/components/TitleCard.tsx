import { useEffect } from "react";
import type { CatalogTitle } from "@streamer-ai/contracts";
import type { PlaybackCheckState } from "./usePlaybackChecks";

interface TitleCardProps {
  item: CatalogTitle;
  reason?: string;
  hero?: boolean;
  onPlay: (item: CatalogTitle) => void;
  onCheck?: (item: CatalogTitle) => void;
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
  reason,
  hero = false,
  onPlay,
  onCheck,
  onAdd,
  onRemove,
  playbackEnabled = true,
  pendingAction,
  playbackCheck,
}: TitleCardProps) {
  const playable = titleHasPlayableVariant(item);
  const checkStatus = playbackCheck?.status ?? "checking";
  const canShowPlayback = playbackEnabled || playable;
  const displayAvailability = playbackEnabled
    ? checkStatus === "failed"
      ? "unavailable"
      : checkStatus === "ready"
        ? "available"
        : "unknown"
    : item.availability;

  useEffect(() => {
    if (playbackEnabled && onCheck) onCheck(item);
  }, [item, onCheck, playbackEnabled]);

  const classNames = [
    "title-card",
    hero ? "title-card--hero" : "",
    displayAvailability === "unavailable" ? "title-card--unavailable" : "",
    displayAvailability === "unknown" ? "title-card--unknown" : "",
    playbackEnabled && checkStatus === "failed"
      ? "title-card--playback-unavailable"
      : "",
    item.kind === "series" ? "title-card--series" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={classNames}
      style={{ "--card-accent": item.accentColor } as React.CSSProperties}
      aria-busy={pendingAction ? "true" : undefined}
    >
      <div className="title-card__art" aria-hidden="true">
        {item.posterUrl ? (
          <img src={item.posterUrl} alt="" />
        ) : (
          <>
            <span>{item.title.slice(0, 1)}</span>
            <i />
          </>
        )}
      </div>
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
        <h3>{item.title}</h3>
        {reason && <p className="title-card__reason">{reason}</p>}
        {hero && <p className="title-card__synopsis">{item.synopsis}</p>}
        <p className="title-card__availability">
          <span
            className={`availability-dot availability-dot--${playbackEnabled && checkStatus === "failed" ? "playback-failed" : playbackEnabled && checkStatus === "ready" ? "available" : displayAvailability}`}
            aria-hidden="true"
          />
          {playbackEnabled
            ? checkStatus === "checking"
              ? "Checking streaming availability…"
              : checkStatus === "failed"
                ? "Sorry, currently unavailable"
                : checkStatus === "ready" &&
                    item.availability !== "available" &&
                    item.availability !== "partial"
                  ? "Verified on streaming source"
                  : availabilityLabel(item)
            : availabilityLabel(item)}
        </p>
        {playbackEnabled && checkStatus === "failed" && (
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
          {canShowPlayback && playbackEnabled && (
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
                    : "▶ Play"}
            </button>
          )}
          {playable && !playbackEnabled && (
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
