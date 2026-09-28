import type { CatalogTitle } from "@streamer-ai/contracts";

interface TitleCardProps {
  item: CatalogTitle;
  reason?: string;
  hero?: boolean;
  onPlay: (item: CatalogTitle) => void;
  onAdd: (item: CatalogTitle) => void;
  onRemove?: (item: CatalogTitle) => void;
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

export function TitleCard({
  item,
  reason,
  hero = false,
  onPlay,
  onAdd,
  onRemove,
}: TitleCardProps) {
  const playable =
    item.availability === "available" || item.availability === "partial";
  const classNames = [
    "title-card",
    hero ? "title-card--hero" : "",
    !playable ? "title-card--muted" : "",
    item.kind === "series" ? "title-card--series" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={classNames}
      style={{ "--card-accent": item.accentColor } as React.CSSProperties}
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
            className={`availability-dot availability-dot--${item.availability}`}
            aria-hidden="true"
          />
          {availabilityLabel(item)}
        </p>
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
          {playable && (
            <button
              className="button button--primary button--compact"
              type="button"
              onClick={() => onPlay(item)}
            >
              <span aria-hidden="true">▶</span>{" "}
              {item.kind === "series" ? "Play next" : "Play"}
            </button>
          )}
          {item.inLibrary ? (
            onRemove ? (
              <button
                className="button button--secondary button--compact"
                type="button"
                onClick={() => onRemove(item)}
              >
                Remove
              </button>
            ) : (
              <span className="in-library">✓ In Library</span>
            )
          ) : (
            <button
              className="button button--secondary button--compact"
              type="button"
              onClick={() => onAdd(item)}
            >
              + Add to Library
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
