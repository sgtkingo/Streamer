import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CatalogTitle,
  EpisodeSelection,
  DiscoveryResponse,
  HomeFeed,
  PlaybackPreferences,
} from "@streamer-ai/contracts";
import type { PlaybackGrant, StreamerApi } from "../api/client";
import { safeErrorMessage } from "../api/client";
import { TitleCard } from "./TitleCard";
import { usePlaybackChecks } from "./usePlaybackChecks";

interface HomePageProps {
  api: StreamerApi;
  profileId: string;
  locale: string;
  playbackPreferences: PlaybackPreferences;
  version?: number;
  onLibraryChanged: () => void;
  onPlaybackReady: (
    item: CatalogTitle,
    grant: PlaybackGrant,
    episode?: EpisodeSelection,
  ) => void;
  onOpenTitle: (item: CatalogTitle) => void;
}

const stageLabels = [
  "Understanding your request",
  "Finding possible titles",
  "Validating metadata",
  "Checking your streaming source",
  "Ranking verified matches",
];

type DiscoveryUiResponse = DiscoveryResponse;

interface PendingAction {
  titleId: string;
  kind: "play" | "add";
}

interface ConversationTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export function HomePage({
  api,
  profileId,
  locale,
  playbackPreferences,
  version,
  onLibraryChanged,
  onPlaybackReady,
  onOpenTitle,
}: HomePageProps) {
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<DiscoveryUiResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isWakingAgent, setIsWakingAgent] = useState(false);
  const [activeStage, setActiveStage] = useState(0);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const requestCounter = useRef(0);
  const searchSerial = useRef(0);
  const activeSearch = useRef<AbortController | null>(null);
  const sessionIsClean = useRef(true);
  const searchProgressRef = useRef<HTMLElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const scrollToNextResult = useRef(false);
  const playbackChecks = usePlaybackChecks(api, profileId);

  const loadHome = useCallback(async () => {
    try {
      setFeed(await api.getHome(profileId));
      setError("");
    } catch (loadError) {
      setError(safeErrorMessage(loadError));
    } finally {
      setIsLoadingFeed(false);
    }
  }, [api, profileId]);

  useEffect(() => {
    void loadHome();
  }, [loadHome, version]);

  useEffect(() => {
    if (!feed || !window.location.hash) return;
    const target = document.getElementById(
      decodeURIComponent(window.location.hash.slice(1)),
    );
    target?.scrollIntoView({ block: "start" });
  }, [feed]);

  useEffect(() => {
    if (!result) return;
    const count = discoveryTitles(result).length;
    setAnnouncement(
      `${count} validated ${count === 1 ? "title" : "titles"} ready.`,
    );
    resultsHeadingRef.current?.focus();
    if (scrollToNextResult.current) {
      scrollToNextResult.current = false;
      resultsHeadingRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [result]);

  useEffect(() => {
    if (!isSearching) return;
    searchProgressRef.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "center",
    });
    const interval = window.setInterval(() => {
      setActiveStage((stage) => Math.min(stage + 1, isWakingAgent ? 1 : 3));
    }, 650);
    return () => window.clearInterval(interval);
  }, [isSearching, isWakingAgent]);

  useEffect(() => {
    if (!isSearching || !isWakingAgent) return;
    let pending = false;
    const interval = window.setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const status = await api.getInferenceResidency(
          activeSearch.current?.signal,
        );
        if (
          status.state === "loaded" &&
          activeSearch.current?.signal.aborted === false
        ) {
          setIsWakingAgent(false);
          setAnnouncement("The local agent is awake and finding your matches.");
        }
      } catch {
        // Keep the wake-up notice until discovery ends if the probe is unavailable.
      } finally {
        pending = false;
      }
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [api, isSearching, isWakingAgent]);

  useEffect(
    () => () => {
      searchSerial.current += 1;
      activeSearch.current?.abort();
    },
    [profileId],
  );

  const stopSearch = () => {
    searchSerial.current += 1;
    activeSearch.current?.abort();
    activeSearch.current = null;
    // The server may have completed the cancelled turn before the transport closed.
    sessionIsClean.current = false;
    setIsSearching(false);
    setIsWakingAgent(false);
    setIsLaunching(false);
    setAnnouncement("Search stopped.");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = query.trim();
    if (message.length < 2 || activeSearch.current) return;
    const controller = new AbortController();
    const serial = ++searchSerial.current;
    const keepConversation = sessionIsClean.current;
    activeSearch.current = controller;
    setIsSearching(true);
    setIsWakingAgent(false);
    setIsLaunching(true);
    setActiveStage(0);
    setError("");
    setNotice("");
    setAnnouncement("StreamerAI is finding and validating titles.");
    window.setTimeout(() => {
      if (serial === searchSerial.current) setIsLaunching(false);
    }, 600);
    try {
      if (feed?.mode === "live") {
        try {
          const status = await api.getInferenceResidency(
            controller.signal,
            true,
          );
          if (serial !== searchSerial.current || controller.signal.aborted)
            return;
          if (status.state === "unloaded") {
            setIsWakingAgent(true);
            setActiveStage((stage) => Math.min(stage, 1));
            setAnnouncement("");
          }
        } catch {
          if (serial !== searchSerial.current || controller.signal.aborted)
            return;
          // A failed probe must not prevent discovery.
        }
      }
      const response = await api.discover(
        {
          profileId,
          message,
          sessionId: keepConversation ? result?.sessionId : undefined,
          idempotencyKey: `${Date.now()}-${++requestCounter.current}`,
        },
        controller.signal,
      );
      setIsWakingAgent(false);
      setActiveStage(stageLabels.length - 1);
      // Let the final validation cue register before revealing a fast response.
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      if (serial !== searchSerial.current || controller.signal.aborted) return;
      sessionIsClean.current = true;
      scrollToNextResult.current = true;
      setResult(response as DiscoveryUiResponse);
      setTurns((current) => [
        ...(keepConversation ? current : []),
        {
          id: `${response.sessionId}-user-${requestCounter.current}`,
          role: "user",
          text: message,
        },
        {
          id: `${response.sessionId}-assistant-${requestCounter.current}`,
          role: "assistant",
          text: response.reply,
        },
      ]);
      setQuery("");
    } catch (searchError) {
      if (serial === searchSerial.current && !controller.signal.aborted) {
        sessionIsClean.current = false;
        setError(safeErrorMessage(searchError));
      }
    } finally {
      if (serial === searchSerial.current) {
        activeSearch.current = null;
        setIsSearching(false);
        setIsWakingAgent(false);
        setIsLaunching(false);
      }
    }
  };

  const add = async (item: CatalogTitle) => {
    if (pendingAction) return;
    setPendingAction({ titleId: item.id, kind: "add" });
    setError("");
    try {
      await api.addToLibrary(profileId, item.id);
      setNotice(`${item.title} was added to your Library.`);
      onLibraryChanged();
      await loadHome();
      setResult((current) =>
        current ? markInLibrary(current, item.id) : current,
      );
    } catch (actionError) {
      setError(safeErrorMessage(actionError));
    } finally {
      setPendingAction(null);
    }
  };

  const play = async (item: CatalogTitle, episode?: EpisodeSelection) => {
    if (pendingAction) return;
    setPendingAction({ titleId: item.id, kind: "play" });
    setError("");
    try {
      const response = await api.preparePlayback(profileId, item.id, episode);
      onPlaybackReady(item, response.playback, episode);
    } catch (actionError) {
      playbackChecks.markFailed(item, safeErrorMessage(actionError), episode);
    } finally {
      setPendingAction(null);
    }
  };

  const pendingFor = (item: CatalogTitle) =>
    pendingAction?.titleId === item.id ? pendingAction.kind : undefined;

  const resultMode = result?.mode ?? "preview";
  const availableResults =
    result?.available.filter((item) =>
      ["available", "partial"].includes(item.title.availability),
    ) ?? [];
  const unavailableResults =
    result?.unavailable.filter(
      (item) => item.title.availability === "unavailable",
    ) ?? [];
  const unknownResults = result?.unverified ?? [];
  const wakeMessage =
    locale === "cs"
      ? "Ouč, agent usnul. Musím ho vzbudit, počkej chvíli…"
      : "Ouch, the local agent dozed off. Waking it up—hang tight…";

  return (
    <main id="home" className="home-page">
      <section
        className="discovery-composer"
        aria-labelledby="discovery-heading"
      >
        <p className="eyebrow">Conversational discovery</p>
        <h1 id="discovery-heading">What are you in the mood for?</h1>
        <p>
          Describe a feeling, actor, era or the people you are watching with.
        </p>
        <form className="composer-form" onSubmit={submit}>
          <label className="sr-only" htmlFor="discovery-query">
            Ask StreamerAI for a movie or series
          </label>
          <textarea
            id="discovery-query"
            rows={1}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!isSearching) event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={"Try “an autumn movie with Sandra Bullock”"}
          />
          <button
            className={`composer-submit${isSearching ? " is-searching" : ""}${isLaunching ? " is-launching" : ""}`}
            type={isSearching ? "button" : "submit"}
            onClick={isSearching ? stopSearch : undefined}
            disabled={!isSearching && query.trim().length < 2}
            aria-label={isSearching ? "Stop search" : "Find something"}
          >
            <span className="composer-submit__label" aria-hidden={isSearching}>
              Find something{" "}
              <span className="composer-submit__enter" aria-hidden="true">
                ↵
              </span>
            </span>
            <span className="composer-submit__stop" aria-hidden="true" />
            <span className="composer-submit__gleam" aria-hidden="true" />
          </button>
        </form>
        <div className="prompt-examples" aria-label="Example searches">
          {[
            "A clever mystery for tonight",
            "A warm 90s comedy",
            "A complete sci-fi series",
          ].map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setQuery(example)}
            >
              {example}
            </button>
          ))}
        </div>
      </section>

      {isSearching && (
        <>
          <section
            className="pipeline"
            ref={searchProgressRef}
            aria-live="polite"
            aria-label="Discovery progress"
          >
            {stageLabels.map((label, index) => (
              <span
                key={label}
                className={
                  index === activeStage
                    ? "is-active"
                    : index < activeStage
                      ? "is-done"
                      : ""
                }
              >
                <span className="pipeline__indicator" aria-hidden="true" />
                {label}
              </span>
            ))}
          </section>
          {isWakingAgent && (
            <p className="agent-wake-notice" role="status">
              <span className="agent-wake-notice__spark" aria-hidden="true">
                ✦
              </span>
              {wakeMessage}
            </p>
          )}
        </>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {error && (
        <p className="page-message page-message--error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="page-message" role="status">
          {notice}
        </p>
      )}

      {result && (
        <section
          className="discovery-results"
          aria-labelledby="results-heading"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">StreamerAI answer</p>
              <h2 id="results-heading" ref={resultsHeadingRef} tabIndex={-1}>
                A considered shortlist
              </h2>
            </div>
            <p>{result.reply}</p>
          </div>
          <ol
            className="conversation-thread"
            aria-label="Discovery conversation"
          >
            {turns.map((turn) => (
              <li
                key={turn.id}
                className={`conversation-turn conversation-turn--${turn.role}`}
              >
                <span>{turn.role === "user" ? "You" : "StreamerAI"}</span>
                <p>{turn.text}</p>
              </li>
            ))}
          </ol>
          {result.warnings.map((warning) => (
            <p className="preview-notice" key={warning}>
              {warning}
            </p>
          ))}
          {result.bestMatch && (
            <TitleCard
              item={result.bestMatch.title}
              preferences={playbackPreferences}
              onOpen={onOpenTitle}
              reason={result.bestMatch.reason}
              hero
              onPlay={play}
              onCheck={playbackChecks.check}
              playbackCheck={playbackChecks.stateFor(result.bestMatch.title)}
              onAdd={add}
              playbackEnabled={resultMode === "live"}
              pendingAction={pendingFor(result.bestMatch.title)}
            />
          )}
          {availableResults.length > 0 && (
            <div className="result-group">
              <h3>Available to stream</h3>
              <div className="title-grid">
                {availableResults.map(({ title, reason }) => (
                  <TitleCard
                    key={title.id}
                    item={title}
                    preferences={playbackPreferences}
                    onOpen={onOpenTitle}
                    reason={reason}
                    onPlay={play}
                    onCheck={playbackChecks.check}
                    playbackCheck={playbackChecks.stateFor(title)}
                    onAdd={add}
                    playbackEnabled={resultMode === "live"}
                    pendingAction={pendingFor(title)}
                  />
                ))}
              </div>
            </div>
          )}
          {unavailableResults.length > 0 && (
            <div className="result-group result-group--unavailable">
              <h3>Found, not currently available</h3>
              <div className="title-grid">
                {unavailableResults.map(({ title, reason }) => (
                  <TitleCard
                    key={title.id}
                    item={title}
                    preferences={playbackPreferences}
                    onOpen={onOpenTitle}
                    reason={reason}
                    onPlay={play}
                    onCheck={playbackChecks.check}
                    playbackCheck={playbackChecks.stateFor(title)}
                    onAdd={add}
                    playbackEnabled={resultMode === "live"}
                    pendingAction={pendingFor(title)}
                  />
                ))}
              </div>
            </div>
          )}
          {unknownResults.length > 0 && (
            <div className="result-group result-group--unknown">
              <h3>Found, availability not checked</h3>
              <p className="result-group__description">
                These titles are valid database matches, but the streaming
                source did not return a definitive result.
              </p>
              <div className="title-grid">
                {unknownResults.map(({ title, reason }) => (
                  <TitleCard
                    key={title.id}
                    item={title}
                    preferences={playbackPreferences}
                    onOpen={onOpenTitle}
                    reason={reason}
                    onPlay={play}
                    onCheck={playbackChecks.check}
                    playbackCheck={playbackChecks.stateFor(title)}
                    onAdd={add}
                    playbackEnabled={resultMode === "live"}
                    pendingAction={pendingFor(title)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {feed?.mode === "preview" && (
        <p className="preview-notice">
          Preview data is active. Live metadata, ratings and availability
          replace it after provider setup.
        </p>
      )}
      {isLoadingFeed && (
        <p className="empty-inline" role="status">
          Loading your Home sections…
        </p>
      )}
      <div className="home-sections">
        {feed?.sections.map((section) => (
          <section
            id={section.id}
            className="home-section"
            key={section.id}
            aria-labelledby={`${section.id}-heading`}
          >
            <div className="section-heading section-heading--row">
              <div>
                <p className="eyebrow">{section.subtitle}</p>
                <h2 id={`${section.id}-heading`}>{section.title}</h2>
              </div>
              <span className={`freshness freshness--${section.freshness}`}>
                {section.freshness}
              </span>
            </div>
            {section.items.length > 0 ? (
              <div className="title-row">
                {section.items.map((item) => (
                  <TitleCard
                    key={item.id}
                    item={item}
                    preferences={playbackPreferences}
                    onOpen={onOpenTitle}
                    onPlay={play}
                    onCheck={playbackChecks.check}
                    playbackCheck={playbackChecks.stateFor(item)}
                    onAdd={add}
                    playbackEnabled={feed.mode === "live"}
                    pendingAction={pendingFor(item)}
                  />
                ))}
              </div>
            ) : (
              <p className="empty-inline">
                Nothing here yet. Start a title and it will appear
                automatically.
              </p>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}

function markInLibrary(
  result: DiscoveryUiResponse,
  titleId: string,
): DiscoveryUiResponse {
  const update = <T extends { title: CatalogTitle }>(item: T): T =>
    item.title.id === titleId
      ? { ...item, title: { ...item.title, inLibrary: true } }
      : item;
  return {
    ...result,
    bestMatch: result.bestMatch ? update(result.bestMatch) : null,
    available: result.available.map(update),
    unavailable: result.unavailable.map(update),
    unverified: result.unverified.map(update),
  };
}

function discoveryTitles(result: DiscoveryUiResponse): CatalogTitle[] {
  const titles = [
    ...(result.bestMatch ? [result.bestMatch.title] : []),
    ...result.available.map((item) => item.title),
    ...result.unavailable.map((item) => item.title),
    ...result.unverified.map((item) => item.title),
  ];
  return [...new Map(titles.map((title) => [title.id, title])).values()];
}
