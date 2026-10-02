import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CatalogTitle,
  PlaybackGrant,
  PlaybackMediaInfo,
  PlaybackPreferences,
} from "@streamer-ai/contracts";
import type { StreamerApi } from "../api/client";
import { safeErrorMessage } from "../api/client";
import {
  preferredAudioTrack,
  preferredEmbeddedSubtitle,
} from "../playback-preferences";
import { Brand } from "./Brand";
import { subtitleFileToVtt } from "./subtitle-file";

interface LocalSubtitle {
  id: string;
  name: string;
  url: string;
}

interface VideoPlayerProps {
  api: StreamerApi;
  title: CatalogTitle;
  grant: PlaybackGrant;
  preferences: PlaybackPreferences;
  onClose: () => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

function channelLabel(channels: number, layout: string | null): string {
  const known = /\b(?:2\.0|2\.1|5\.1|7\.1)\b/.exec(layout ?? "")?.[0];
  if (known) return known;
  if (channels === 1) return "Mono";
  if (channels === 2) return "2.0";
  if (channels === 6) return "5.1";
  if (channels === 8) return "7.1";
  return `${channels} channels`;
}

export function VideoPlayer({
  api,
  title,
  grant,
  preferences,
  onClose,
}: VideoPlayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localUrlsRef = useRef(new Set<string>());
  const resumeAfterLoadRef = useRef(true);
  const lastThumbnailAtRef = useRef(0);
  const progressRef = useRef(0);
  const lastProgressAtRef = useRef(0);
  const startedRef = useRef(false);
  const closingRef = useRef(false);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [info, setInfo] = useState<PlaybackMediaInfo | null>(null);
  const [loadingError, setLoadingError] = useState("");
  const [subtitleError, setSubtitleError] = useState("");
  const [playbackError, setPlaybackError] = useState("");
  const [selectedAudio, setSelectedAudio] = useState<number | null>(null);
  const [selectedSubtitle, setSelectedSubtitle] = useState("off");
  const [localSubtitles, setLocalSubtitles] = useState<LocalSubtitle[]>([]);
  const [menu, setMenu] = useState<"audio" | "subtitles" | null>(null);
  const [sourceStart, setSourceStart] = useState(0);
  const [sourceVersion, setSourceVersion] = useState(0);
  const [position, setPosition] = useState(0);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    time: number;
    percent: number;
  } | null>(null);
  const [thumbnailAt, setThumbnailAt] = useState(0);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [needsClick, setNeedsClick] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (cleanupTimerRef.current !== null) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
    let active = true;
    api
      .getPlaybackManifest(grant.grantId)
      .then((manifest) => {
        if (!active) return;
        const savedPercent = title.progressPercent ?? 0;
        const resumeAt =
          manifest.durationSeconds !== null &&
          savedPercent >= 2 &&
          savedPercent < 95
            ? (manifest.durationSeconds * savedPercent) / 100
            : 0;
        const audio = preferredAudioTrack(manifest, preferences);
        setInfo(manifest);
        setSelectedAudio(audio?.streamIndex ?? null);
        setSelectedSubtitle(
          preferredEmbeddedSubtitle(manifest, preferences, audio),
        );
        setSourceStart(resumeAt);
        setPosition(resumeAt);
        progressRef.current = resumeAt > 0 ? savedPercent : 0;
      })
      .catch((error: unknown) => {
        if (active) setLoadingError(safeErrorMessage(error));
      });
    return () => {
      active = false;
      // StrictMode replays effects in development; do not revoke that live grant.
      cleanupTimerRef.current = setTimeout(() => {
        cleanupTimerRef.current = null;
        if (closingRef.current) return;
        const save = startedRef.current
          ? api.savePlaybackProgress(grant.grantId, progressRef.current)
          : Promise.resolve();
        void save
          .catch(() => undefined)
          .finally(() =>
            api.closePlayback(grant.grantId).catch(() => undefined),
          );
      }, 0);
    };
  }, [api, grant.grantId, preferences, title.progressPercent]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    const localUrls = localUrlsRef.current;
    document.body.style.overflow = "hidden";
    rootRef.current?.focus();
    return () => {
      document.body.style.overflow = oldOverflow;
      previous?.focus();
      for (const url of localUrls) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.altKey) return;
      event.preventDefault();
      setMuted(false);
      setVolume((current) =>
        Math.min(1, Math.max(0, current + (event.deltaY < 0 ? 0.05 : -0.05))),
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = muted;
    }
  }, [volume, muted, sourceVersion]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video
        .play()
        .then(() => setNeedsClick(false))
        .catch(() => {
          setNeedsClick(true);
        });
    } else {
      video.pause();
    }
  };

  const closePlayer = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const save = startedRef.current
      ? api.savePlaybackProgress(grant.grantId, progressRef.current)
      : Promise.resolve();
    void save
      .catch(() => undefined)
      .then(() => api.closePlayback(grant.grantId).catch(() => undefined))
      .finally(onClose);
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (document.fullscreenElement) return;
        closePlayer();
        return;
      }
      if (event.key === "Tab" && rootRef.current) {
        const focusable = Array.from(
          rootRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      const interactive = target?.closest("button, input, select, textarea, a");
      if (interactive && !event.altKey) return;
      event.preventDefault();
      togglePlayback();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const duration = info?.durationSeconds ?? 0;
  const shownPosition = scrubPosition ?? position;
  const progress =
    duration > 0 ? Math.min(100, (shownPosition / duration) * 100) : 0;
  const mediaUrl = useMemo(() => {
    if (!info) return "";
    const parameters = new URLSearchParams({ start: sourceStart.toFixed(3) });
    if (selectedAudio !== null) parameters.set("audio", String(selectedAudio));
    return `${grant.url}/media?${parameters}`;
  }, [grant.url, info, selectedAudio, sourceStart]);

  const selectedLocal = localSubtitles.find(
    (track) => selectedSubtitle === `local:${track.id}`,
  );
  const selectedEmbedded = info?.subtitleTracks.find(
    (track) => selectedSubtitle === `embedded:${track.streamIndex}`,
  );
  const subtitleUrl =
    selectedLocal?.url ??
    (selectedEmbedded
      ? `${grant.url}/subtitles/${selectedEmbedded.streamIndex}`
      : null);

  const restartAt = (seconds: number, audio = selectedAudio) => {
    const at = Math.min(Math.max(0, seconds), Math.max(0, duration - 0.2));
    if (duration > 0) progressRef.current = (at / duration) * 100;
    resumeAfterLoadRef.current = videoRef.current
      ? !videoRef.current.paused
      : true;
    videoRef.current?.pause();
    setSelectedAudio(audio);
    setPosition(at);
    setSourceStart(at);
    setSourceVersion((value) => value + 1);
    setScrubPosition(null);
    setPreview(null);
    setPlaybackError("");
  };

  const commitSeek = (seconds: number) => {
    if (duration <= 0) return;
    restartAt(seconds);
  };

  const previewAtPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const percent = Math.max(
      0,
      Math.min(1, (event.clientX - bounds.left) / bounds.width),
    );
    const time = percent * duration;
    setPreview({ time, percent: percent * 100 });
    const now = Date.now();
    if (now - lastThumbnailAtRef.current >= 200) {
      lastThumbnailAtRef.current = now;
      setThumbnailAt(Math.floor(time / 5) * 5);
      setThumbnailFailed(false);
    }
  };

  const addSubtitleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Subtitle files must be smaller than 5 MB.");
      }
      const vtt = subtitleFileToVtt(file.name, await file.text());
      const url = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
      const track = { id: crypto.randomUUID(), name: file.name, url };
      localUrlsRef.current.add(url);
      setLocalSubtitles((current) => [...current, track]);
      setSelectedSubtitle(`local:${track.id}`);
      setSubtitleError("");
      setMenu(null);
    } catch (error) {
      setSubtitleError(
        error instanceof Error
          ? error.message
          : "The subtitle file could not be read.",
      );
    }
  };

  return (
    <div
      className="video-player"
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Playing ${title.title}`}
      tabIndex={-1}
    >
      <div
        className="video-player__stage"
        style={{
          backgroundImage:
            title.backdropUrl || title.posterUrl
              ? `linear-gradient(#0009, #000), url("${title.backdropUrl ?? title.posterUrl}")`
              : undefined,
        }}
      >
        {info && (
          <video
            key={`${sourceVersion}:${selectedAudio ?? "silent"}`}
            ref={videoRef}
            className="video-player__video"
            src={mediaUrl}
            poster={title.backdropUrl ?? title.posterUrl ?? undefined}
            playsInline
            preload="auto"
            onCanPlay={() => {
              if (!resumeAfterLoadRef.current) return;
              resumeAfterLoadRef.current = false;
              void videoRef.current
                ?.play()
                .then(() => setNeedsClick(false))
                .catch(() => setNeedsClick(true));
            }}
            onPlay={() => {
              startedRef.current = true;
              setPlaying(true);
            }}
            onPause={() => {
              setPlaying(false);
              if (startedRef.current && duration > 0) {
                void api
                  .savePlaybackProgress(grant.grantId, progressRef.current)
                  .catch(() => undefined);
              }
            }}
            onTimeUpdate={(event) => {
              const at = sourceStart + event.currentTarget.currentTime;
              setPosition(at);
              if (duration > 0) {
                progressRef.current = Math.min(100, (at / duration) * 100);
                if (
                  startedRef.current &&
                  Date.now() - lastProgressAtRef.current > 15_000
                ) {
                  lastProgressAtRef.current = Date.now();
                  void api
                    .savePlaybackProgress(grant.grantId, progressRef.current)
                    .catch(() => undefined);
                }
              }
            }}
            onEnded={() => {
              setPlaying(false);
              if (duration > 0) setPosition(duration);
              progressRef.current = 100;
              void api
                .savePlaybackProgress(grant.grantId, 100)
                .catch(() => undefined);
            }}
            onLoadedData={() => setPlaybackError("")}
            onError={() => {
              setPlaying(false);
              setPlaybackError(
                "This video could not be played. Close the player and try again.",
              );
            }}
            onClick={togglePlayback}
          >
            {subtitleUrl && (
              <track
                key={subtitleUrl}
                kind="subtitles"
                src={subtitleUrl}
                srcLang={selectedEmbedded?.language ?? "en"}
                label={
                  selectedLocal?.name ?? selectedEmbedded?.title ?? "Subtitles"
                }
                default
                onLoad={() => {
                  const tracks = videoRef.current?.textTracks;
                  if (tracks?.[0]) {
                    tracks[0].mode = "showing";
                    if (typeof VTTCue !== "undefined") {
                      for (const cue of Array.from(tracks[0].cues ?? [])) {
                        if (cue instanceof VTTCue) cue.line = 76;
                      }
                    }
                  }
                  setSubtitleError("");
                }}
                onError={() =>
                  setSubtitleError(
                    "These subtitles could not be loaded. Choose another track or a local file.",
                  )
                }
              />
            )}
          </video>
        )}
        <div className="video-player__top">
          <div>
            <Brand className="brand--player" />
            <p className="video-player__eyebrow">Now playing</p>
            <h2>{title.title}</h2>
            {title.year && <small>{title.year}</small>}
          </div>
          <button
            type="button"
            className="video-player__icon-button"
            onClick={closePlayer}
            aria-label="Close player"
          >
            ×
          </button>
        </div>

        {!info && !loadingError && (
          <div className="video-player__center-message" role="status">
            <span className="video-player__spinner" />
            Preparing your video…
          </div>
        )}
        {(loadingError || playbackError) && (
          <div
            className="video-player__center-message video-player__center-message--error"
            role="alert"
          >
            <strong>Playback unavailable</strong>
            <span>{loadingError || playbackError}</span>
            <button
              type="button"
              className="button button--secondary"
              onClick={closePlayer}
            >
              Back to StreamerAI
            </button>
          </div>
        )}
        {info && !playing && !playbackError && (
          <button
            type="button"
            className="video-player__center-play"
            onClick={togglePlayback}
            aria-label={needsClick ? "Start playback" : "Play video"}
          >
            ▶
          </button>
        )}

        {info && (
          <div className="video-player__controls">
            {subtitleError && (
              <p className="video-player__subtitle-error" role="alert">
                {subtitleError}
              </p>
            )}
            {duration > 0 && (
              <div
                className="video-player__timeline"
                onPointerMove={previewAtPointer}
                onPointerLeave={() => setPreview(null)}
              >
                {preview && (
                  <div
                    className="video-player__preview"
                    style={{ left: `${preview.percent}%` }}
                  >
                    {!thumbnailFailed && (
                      <img
                        src={`${grant.url}/thumbnail?at=${thumbnailAt}`}
                        alt=""
                        onError={() => setThumbnailFailed(true)}
                      />
                    )}
                    <span>{formatTime(preview.time)}</span>
                  </div>
                )}
                <input
                  className="video-player__seek"
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={Math.min(shownPosition, duration)}
                  style={
                    { "--seek-progress": `${progress}%` } as React.CSSProperties
                  }
                  aria-label="Seek through video"
                  aria-valuetext={`${formatTime(shownPosition)} of ${formatTime(duration)}`}
                  onChange={(event) =>
                    setScrubPosition(Number(event.target.value))
                  }
                  onPointerUp={(event) =>
                    commitSeek(Number(event.currentTarget.value))
                  }
                  onKeyUp={(event) => {
                    if (
                      [
                        "ArrowLeft",
                        "ArrowRight",
                        "Home",
                        "End",
                        "PageUp",
                        "PageDown",
                      ].includes(event.key)
                    ) {
                      commitSeek(Number(event.currentTarget.value));
                    }
                  }}
                />
              </div>
            )}
            <div className="video-player__control-row">
              <button
                type="button"
                className="video-player__icon-button"
                onClick={togglePlayback}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? "Ⅱ" : "▶"}
              </button>
              <span className="video-player__time">
                {formatTime(shownPosition)}{" "}
                <span>/ {duration > 0 ? formatTime(duration) : "—"}</span>
              </span>
              <div className="video-player__spacer" />
              <button
                type="button"
                className="video-player__icon-button"
                onClick={() => setMuted((value) => !value)}
                aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
              >
                {muted || volume === 0 ? "◖" : "◖))"}
              </button>
              <input
                className="video-player__volume"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(event) => {
                  setVolume(Number(event.target.value));
                  setMuted(false);
                }}
                aria-label="Volume"
              />
              <div className="video-player__menu-anchor">
                <button
                  type="button"
                  className="video-player__text-button"
                  onClick={() => setMenu(menu === "audio" ? null : "audio")}
                  aria-expanded={menu === "audio"}
                >
                  Audio
                </button>
                {menu === "audio" && (
                  <div
                    className="video-player__menu"
                    role="group"
                    aria-label="Audio tracks"
                  >
                    <strong>Audio tracks</strong>
                    {info.audioTracks.length === 0 && (
                      <span>No audio tracks</span>
                    )}
                    {info.audioTracks.map((track, index) => (
                      <button
                        type="button"
                        key={track.streamIndex}
                        className={
                          selectedAudio === track.streamIndex
                            ? "is-selected"
                            : ""
                        }
                        onClick={() => {
                          restartAt(position, track.streamIndex);
                          if (preferences.autoFindSubtitles)
                            setSelectedSubtitle(
                              preferredEmbeddedSubtitle(
                                info,
                                preferences,
                                track,
                              ),
                            );
                          setMenu(null);
                        }}
                      >
                        <span>
                          {track.title ??
                            track.language?.toUpperCase() ??
                            `Track ${index + 1}`}
                        </span>
                        <small>
                          {channelLabel(track.channels, track.channelLayout)} ·{" "}
                          {track.codec.toUpperCase()}
                        </small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="video-player__menu-anchor">
                <button
                  type="button"
                  className="video-player__text-button"
                  onClick={() =>
                    setMenu(menu === "subtitles" ? null : "subtitles")
                  }
                  aria-expanded={menu === "subtitles"}
                >
                  Subtitles
                </button>
                {menu === "subtitles" && (
                  <div
                    className="video-player__menu"
                    role="group"
                    aria-label="Subtitle tracks"
                  >
                    <strong>Subtitles</strong>
                    <button
                      type="button"
                      className={
                        selectedSubtitle === "off" ? "is-selected" : ""
                      }
                      onClick={() => {
                        setSelectedSubtitle("off");
                        setMenu(null);
                      }}
                    >
                      Off
                    </button>
                    {info.subtitleTracks.map((track, index) => (
                      <button
                        type="button"
                        key={track.streamIndex}
                        className={
                          selectedSubtitle === `embedded:${track.streamIndex}`
                            ? "is-selected"
                            : ""
                        }
                        onClick={() => {
                          setSelectedSubtitle(`embedded:${track.streamIndex}`);
                          setMenu(null);
                        }}
                      >
                        {track.title ??
                          track.language?.toUpperCase() ??
                          `Embedded ${index + 1}`}
                      </button>
                    ))}
                    {localSubtitles.map((track) => (
                      <button
                        type="button"
                        key={track.id}
                        className={
                          selectedSubtitle === `local:${track.id}`
                            ? "is-selected"
                            : ""
                        }
                        onClick={() => {
                          setSelectedSubtitle(`local:${track.id}`);
                          setMenu(null);
                        }}
                      >
                        {track.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="video-player__add-subtitle"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      + Load subtitle file
                    </button>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept=".srt,.vtt,.ass,.ssa,text/vtt"
                aria-label="Choose subtitle file"
                onChange={(event) => {
                  void addSubtitleFile(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              <button
                type="button"
                className="video-player__icon-button"
                onClick={() => {
                  if (document.fullscreenElement)
                    void document.exitFullscreen();
                  else void rootRef.current?.requestFullscreen();
                }}
                aria-label="Toggle full screen"
              >
                ⛶
              </button>
            </div>
            <p className="video-player__hint">
              Space / Alt+Space: play or pause · Alt+wheel: volume
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
