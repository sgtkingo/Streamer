import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  CatalogTitle,
  EpisodeSelection,
  TitleDetail as Detail,
} from "@streamer-ai/contracts";
import type { StreamerApi } from "../api/client";
import { safeErrorMessage } from "../api/client";
import { sourceLabel } from "../source-label";
import { useToasts } from "./ToastProvider";
import { playCardHoverTick } from "./TitleCard";

interface Props {
  api: StreamerApi;
  profileId: string;
  title: CatalogTitle;
  playbackEnabled: boolean;
  suspended?: boolean;
  onClose: () => void;
  onOpenRelated: (title: CatalogTitle) => void;
  onPlay: (
    title: CatalogTitle,
    episode?: EpisodeSelection,
    episodeTitle?: string,
    sourceId?: string,
  ) => Promise<void>;
  onAdded: () => void;
}

function PlayActionContent({ label }: { label: string }) {
  return (
    <>
      <span className="play-action__icon" aria-hidden="true">
        ▶
      </span>
      <span className="play-action__label">{label}</span>
    </>
  );
}

export function TitleDetail({
  api,
  profileId,
  title,
  playbackEnabled,
  suspended = false,
  onClose,
  onOpenRelated,
  onPlay,
  onAdded,
}: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const { showToast } = useToasts();
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [openSourceFor, setOpenSourceFor] = useState<string | null>(null);
  const openSourceForRef = useRef(openSourceFor);
  openSourceForRef.current = openSourceFor;

  useEffect(() => {
    if (error) showToast(error, "error");
  }, [error, showToast]);
  const [movieStatus, setMovieStatus] = useState<
    "checking" | "ready" | "unavailable"
  >("checking");
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const scrollTopRef = useRef(0);
  const lastPlayedEpisodeRef = useRef<string | null>(null);
  const wasSuspendedRef = useRef(false);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setError("");
    setSelectedSeason(null);
    setMovieStatus("checking");
    const load = async () => {
      try {
        const result = await api.getTitleDetail(profileId, title.id);
        if (active) setDetail(result);
      } catch (loadError) {
        if (active) setError(safeErrorMessage(loadError));
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [api, profileId, title.id]);

  useEffect(() => {
    if (detail?.series?.status !== "searching") return;
    let active = true;
    const timer = window.setInterval(() => {
      void api
        .getTitleDetail(profileId, title.id)
        .then((result) => {
          if (active) setDetail(result);
        })
        .catch(() => {
          if (active) setError("Episode search is temporarily unavailable.");
        });
    }, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [api, detail?.series?.status, profileId, title.id]);

  useEffect(() => {
    if (suspended) {
      wasSuspendedRef.current = true;
      return;
    }
    if (!wasSuspendedRef.current) return;
    wasSuspendedRef.current = false;
    let active = true;
    void api
      .getTitleDetail(profileId, title.id)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch(() => {
        if (active) setError("Details could not be refreshed.");
      });
    return () => {
      active = false;
    };
  }, [api, profileId, suspended, title.id]);

  useEffect(() => {
    if (title.kind !== "movie" || !playbackEnabled) return;
    let active = true;
    void api
      .checkPlayback(profileId, title.id)
      .then(() => {
        if (active) setMovieStatus("ready");
      })
      .catch(() => {
        if (active) setMovieStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, [api, playbackEnabled, profileId, title.id, title.kind]);

  useEffect(() => {
    if (suspended) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const episodeButton = lastPlayedEpisodeRef.current
      ? dialogRef.current?.querySelector<HTMLButtonElement>(
          `button[data-episode="${lastPlayedEpisodeRef.current}"]`,
        )
      : null;
    (episodeButton ?? closeRef.current)?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (openSourceForRef.current !== null) setOpenSourceFor(null);
        else onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const buttons = [
        ...dialogRef.current.querySelectorAll<HTMLButtonElement>(
          "button:not([disabled])",
        ),
      ];
      if (!buttons.length) return;
      if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault();
        buttons[buttons.length - 1]?.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === buttons[buttons.length - 1]
      ) {
        event.preventDefault();
        buttons[0]?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose, suspended]);

  useLayoutEffect(() => {
    if (!suspended && dialogRef.current) {
      dialogRef.current.scrollTop = scrollTopRef.current;
    }
  }, [suspended]);

  const current = detail?.title ?? title;
  const seasons = detail?.series?.seasons ?? [];
  const shownSeason =
    seasons.find((season) => season.seasonNumber === selectedSeason) ??
    seasons[0];
  const sourcesFor = (episode?: EpisodeSelection) =>
    (current.sources ?? []).filter((source) =>
      episode
        ? source.seasonNumber === episode.seasonNumber &&
          source.episodeNumber === episode.episodeNumber
        : source.seasonNumber === null && source.episodeNumber === null,
    );
  const play = async (
    episode?: EpisodeSelection,
    episodeTitle?: string,
    sourceId?: string,
  ) => {
    scrollTopRef.current = dialogRef.current?.scrollTop ?? 0;
    lastPlayedEpisodeRef.current = episode
      ? `${episode.seasonNumber}:${episode.episodeNumber}`
      : null;
    const key = episode
      ? `${episode.seasonNumber}:${episode.episodeNumber}`
      : "movie";
    setPlaying(key);
    setError("");
    try {
      if (sourceId) await onPlay(current, episode, episodeTitle, sourceId);
      else await onPlay(current, episode, episodeTitle);
    } catch (playError) {
      setError(safeErrorMessage(playError));
    } finally {
      setPlaying(null);
    }
  };
  const add = async () => {
    setAdding(true);
    setError("");
    try {
      await api.addToLibrary(profileId, current.id);
      setDetail((value) =>
        value
          ? { ...value, title: { ...value.title, inLibrary: true } }
          : value,
      );
      onAdded();
    } catch (addError) {
      setError(safeErrorMessage(addError));
    } finally {
      setAdding(false);
    }
  };

  if (suspended) return null;

  return (
    <div
      className="title-detail-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="title-detail"
        role="dialog"
        aria-modal="true"
        aria-label={`Details for ${title.title}`}
      >
        <div
          className="title-detail__hero"
          style={
            current.backdropUrl
              ? {
                  backgroundImage: `linear-gradient(90deg, #09090b 20%, transparent), url(${current.backdropUrl})`,
                }
              : { backgroundColor: current.accentColor }
          }
        >
          <button
            ref={closeRef}
            className="title-detail__close close-icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close details"
          >
            ×
          </button>
          <p className="eyebrow">
            {current.kind === "series" ? "Series" : "Movie"}
            {current.year ? ` · ${current.year}` : ""}
          </p>
          <h2>{current.title}</h2>
          {current.genres.length > 0 && (
            <ul className="title-detail__genres" aria-label="Genres">
              {current.genres.map((genre) => (
                <li key={genre}>{genre}</li>
              ))}
            </ul>
          )}
          <p>{current.synopsis}</p>
          <div className="title-detail__ratings">
            {current.ratings.map((rating) => (
              <span key={rating.source}>
                {rating.source}{" "}
                {Math.round((rating.value / rating.scale) * 100)}%
              </span>
            ))}
          </div>
          <div className="title-detail__actions">
            {current.kind === "movie" && playbackEnabled && (
              <button
                className={`button button--primary button--compact${movieStatus === "checking" ? " button--checking" : ""}${movieStatus === "ready" && playing === null ? " button--play-action" : ""}`}
                type="button"
                disabled={movieStatus !== "ready" || playing !== null}
                onClick={() => void play()}
              >
                {movieStatus === "ready"
                  ? playing === "movie"
                    ? "Starting…"
                    : (
                        <PlayActionContent
                          label={
                            current.progressPercent !== null &&
                            current.progressPercent >= 2 &&
                            current.progressPercent < 95
                              ? "Continue"
                              : "Play"
                          }
                        />
                      )
                  : movieStatus === "checking"
                    ? "Checking"
                    : "Currently unavailable"}
              </button>
            )}
            {current.kind === "movie" &&
              playbackEnabled &&
              sourcesFor().length > 1 && (
                <button
                  className="button button--secondary title-detail__source-trigger"
                  type="button"
                  aria-label="More sources for this movie"
                  aria-expanded={openSourceFor === "movie"}
                  onClick={() =>
                    setOpenSourceFor(openSourceFor === "movie" ? null : "movie")
                  }
                >
                  <span aria-hidden="true">⋮</span>
                </button>
              )}
            {openSourceFor === "movie" && (
              <div
                className="title-detail__source-menu"
                role="group"
                aria-label="Movie sources"
              >
                <strong>Choose a source</strong>
                <small>
                  Each file has its own audio, subtitles and quality.
                </small>
                {sourcesFor().map((source, index) => (
                  <button
                    key={source.id}
                    type="button"
                    title={source.releaseName}
                    onClick={() => {
                      setOpenSourceFor(null);
                      void play(undefined, undefined, source.id);
                    }}
                  >
                    <span>
                      {index === 0 ? "Recommended" : `Source ${index + 1}`}
                    </span>
                    <small>{sourceLabel(source)}</small>
                  </button>
                ))}
              </div>
            )}
            {!current.inLibrary && (
              <button
                className="button button--secondary"
                type="button"
                disabled={adding}
                onClick={() => void add()}
              >
                {adding ? "Adding…" : "+ Add to Library"}
              </button>
            )}
            {current.inLibrary && (
              <span className="in-library">✓ In Library</span>
            )}
          </div>
        </div>
        {current.kind === "series" && (
          <div className="title-detail__body">
            <div className="title-detail__heading">
              <h3>Seasons & episodes</h3>
              {detail?.series?.status === "searching" && (
                <span className="title-detail__searching" role="status">
                  • searching...
                </span>
              )}
            </div>
            {!detail && !error && <p>Loading episode guide…</p>}
            {detail?.series === null && (
              <p>Episode guide is not available in preview mode.</p>
            )}
            {detail?.series?.status === "failed" && (
              <div className="title-detail__retry">
                <p>
                  Some episodes could not be checked. Ready episodes are still
                  playable.
                </p>
                <button
                  className="button button--secondary button--compact"
                  type="button"
                  onClick={() => {
                    setError("");
                    void api
                      .getTitleDetail(profileId, title.id, true)
                      .then(setDetail)
                      .catch(() =>
                        setError("Episode search could not restart."),
                      );
                  }}
                >
                  Retry episode search
                </button>
              </div>
            )}
            {seasons.length > 0 && (
              <>
                <div className="title-detail__seasons" aria-label="Seasons">
                  {seasons.map((season) => (
                    <button
                      key={season.seasonNumber}
                      className={
                        shownSeason?.seasonNumber === season.seasonNumber
                          ? "is-active"
                          : ""
                      }
                      type="button"
                      onClick={() => setSelectedSeason(season.seasonNumber)}
                    >
                      Season {season.seasonNumber}
                    </button>
                  ))}
                </div>
                <ol className="title-detail__episodes">
                  {shownSeason?.episodes.map((episode) => (
                    <li
                      key={episode.episodeNumber}
                      className={`title-detail__episode title-detail__episode--${episode.availability}`}
                    >
                      <div>
                        <strong>
                          {episode.episodeNumber}. {episode.title}
                        </strong>
                        {episode.airDate && <small>{episode.airDate}</small>}
                      </div>
                      <span>
                        {episode.availability === "searching"
                          ? "• searching..."
                          : episode.availability === "available"
                            ? "Ready"
                            : "Unavailable"}
                      </span>
                      {episode.availability === "available" &&
                        playbackEnabled && (
                          <button
                            className={`button button--primary button--compact${playing === `${episode.seasonNumber}:${episode.episodeNumber}` ? "" : " button--play-action"}`}
                            type="button"
                            data-episode={`${episode.seasonNumber}:${episode.episodeNumber}`}
                            disabled={playing !== null}
                            onClick={() =>
                              void play(
                                {
                                  seasonNumber: episode.seasonNumber,
                                  episodeNumber: episode.episodeNumber,
                                },
                                episode.title,
                              )
                            }
                          >
                            {playing ===
                            `${episode.seasonNumber}:${episode.episodeNumber}`
                              ? "Starting…"
                              : current.progressPercent !== null &&
                                  current.progressPercent >= 2 &&
                                  current.resumeEpisode?.seasonNumber ===
                                    episode.seasonNumber &&
                                  current.resumeEpisode?.episodeNumber ===
                                    episode.episodeNumber
                                ? <PlayActionContent label="Continue" />
                                : <PlayActionContent label="Play" />}
                          </button>
                        )}
                      {episode.availability === "available" &&
                        playbackEnabled &&
                        sourcesFor({
                          seasonNumber: episode.seasonNumber,
                          episodeNumber: episode.episodeNumber,
                        }).length > 1 && (
                          <button
                            className="button button--secondary button--compact title-detail__source-trigger"
                            type="button"
                            aria-label={`More sources for episode ${episode.episodeNumber}`}
                            aria-expanded={
                              openSourceFor ===
                              `${episode.seasonNumber}:${episode.episodeNumber}`
                            }
                            onClick={() =>
                              setOpenSourceFor(
                                openSourceFor ===
                                  `${episode.seasonNumber}:${episode.episodeNumber}`
                                  ? null
                                  : `${episode.seasonNumber}:${episode.episodeNumber}`,
                              )
                            }
                          >
                            <span aria-hidden="true">⋮</span>
                          </button>
                        )}
                      {openSourceFor ===
                        `${episode.seasonNumber}:${episode.episodeNumber}` && (
                        <div
                          className="title-detail__source-menu"
                          role="group"
                          aria-label={`Sources for episode ${episode.episodeNumber}`}
                        >
                          <strong>Choose a source</strong>
                          <small>
                            Each file has its own audio, subtitles and quality.
                          </small>
                          {sourcesFor({
                            seasonNumber: episode.seasonNumber,
                            episodeNumber: episode.episodeNumber,
                          }).map((source, index) => (
                            <button
                              key={source.id}
                              type="button"
                              title={source.releaseName}
                              onClick={() => {
                                setOpenSourceFor(null);
                                void play(
                                  {
                                    seasonNumber: episode.seasonNumber,
                                    episodeNumber: episode.episodeNumber,
                                  },
                                  episode.title,
                                  source.id,
                                );
                              }}
                            >
                              <span>
                                {index === 0
                                  ? "Recommended"
                                  : `Source ${index + 1}`}
                              </span>
                              <small>{sourceLabel(source)}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}
        <div className="title-detail__body title-detail__body--related">
          <h3>More to watch</h3>
          <p>
            {current.kind === "series"
              ? "Similar series and connected stories from your catalogue."
              : "Related films and saga entries already validated in your local catalogue."}
          </p>
          {detail?.related.length === 0 && (
            <p>More recommendations will appear as you discover titles.</p>
          )}
          {(detail?.related.length ?? 0) > 0 && (
            <div className="title-detail__related">
              {detail?.related.map((related) => (
                <button
                  type="button"
                  key={related.id}
                  onClick={() => onOpenRelated(related)}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") playCardHoverTick();
                  }}
                  onFocus={playCardHoverTick}
                >
                  {related.posterUrl && <img src={related.posterUrl} alt="" />}
                  <span>
                    {related.title}
                    {related.year ? ` (${related.year})` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
