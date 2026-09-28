import { useEffect, useRef, useState } from "react";
import type {
  CatalogTitle,
  DiscoveryResponse,
  HomeFeed,
} from "@streamer-ai/contracts";
import type { StreamerApi } from "../api/client";
import { safeErrorMessage } from "../api/client";
import { TitleCard } from "./TitleCard";

interface HomePageProps {
  api: StreamerApi;
  profileId: string;
  onLibraryChanged: () => void;
}

const stageLabels = [
  "Understanding your request",
  "Finding possible titles",
  "Validating metadata",
  "Checking your streaming source",
  "Ranking verified matches",
];

export function HomePage({ api, profileId, onLibraryChanged }: HomePageProps) {
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<DiscoveryResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestCounter = useRef(0);

  const loadHome = async () => {
    try {
      setFeed(await api.getHome(profileId));
      setError("");
    } catch (loadError) {
      setError(safeErrorMessage(loadError));
    }
  };

  useEffect(() => {
    void loadHome();
  }, [api, profileId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = query.trim();
    if (message.length < 2) return;
    setIsSearching(true);
    setError("");
    setNotice("");
    try {
      const response = await api.discover({
        profileId,
        message,
        sessionId: result?.sessionId,
        idempotencyKey: `${Date.now()}-${++requestCounter.current}`,
      });
      setResult(response);
      setQuery("");
    } catch (searchError) {
      setError(safeErrorMessage(searchError));
    } finally {
      setIsSearching(false);
    }
  };

  const add = async (item: CatalogTitle) => {
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
    }
  };

  const play = async (item: CatalogTitle) => {
    try {
      await api.startPlayback(profileId, item.id);
      setNotice(
        `${item.title} passed the playback preflight and was added to your Library.`,
      );
      onLibraryChanged();
      await loadHome();
      setResult((current) =>
        current ? markInLibrary(current, item.id) : current,
      );
    } catch (actionError) {
      setError(safeErrorMessage(actionError));
    }
  };

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
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={"Try “an autumn movie with Sandra Bullock”"}
          />
          <button
            className="composer-submit"
            type="submit"
            disabled={isSearching || query.trim().length < 2}
          >
            {isSearching ? "Working…" : "Find something"}{" "}
            <span aria-hidden="true">→</span>
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
        <section
          className="pipeline"
          aria-live="polite"
          aria-label="Discovery progress"
        >
          {stageLabels.map((label, index) => (
            <span key={label} className={index === 0 ? "is-active" : ""}>
              {label}
            </span>
          ))}
        </section>
      )}
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
              <h2 id="results-heading">A considered shortlist</h2>
            </div>
            <p>{result.reply}</p>
          </div>
          {result.warnings.map((warning) => (
            <p className="preview-notice" key={warning}>
              {warning}
            </p>
          ))}
          {result.bestMatch && (
            <TitleCard
              item={result.bestMatch.title}
              reason={result.bestMatch.reason}
              hero
              onPlay={play}
              onAdd={add}
            />
          )}
          {result.available.length > 0 && (
            <div className="result-group">
              <h3>Available to stream</h3>
              <div className="title-grid">
                {result.available.map(({ title, reason }) => (
                  <TitleCard
                    key={title.id}
                    item={title}
                    reason={reason}
                    onPlay={play}
                    onAdd={add}
                  />
                ))}
              </div>
            </div>
          )}
          {result.unavailable.length > 0 && (
            <div className="result-group result-group--unavailable">
              <h3>Found, not currently available</h3>
              <div className="title-grid">
                {result.unavailable.map(({ title, reason }) => (
                  <TitleCard
                    key={title.id}
                    item={title}
                    reason={reason}
                    onPlay={play}
                    onAdd={add}
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
                    onPlay={play}
                    onAdd={add}
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
  result: DiscoveryResponse,
  titleId: string,
): DiscoveryResponse {
  const update = <T extends { title: CatalogTitle }>(item: T): T =>
    item.title.id === titleId
      ? { ...item, title: { ...item.title, inLibrary: true } }
      : item;
  return {
    ...result,
    bestMatch: result.bestMatch ? update(result.bestMatch) : null,
    available: result.available.map(update),
    unavailable: result.unavailable.map(update),
  };
}
