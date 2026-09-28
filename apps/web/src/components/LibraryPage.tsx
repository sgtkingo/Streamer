import { useEffect, useState } from "react";
import type {
  CatalogTitle,
  HistoryResponse,
  LibraryResponse,
} from "@streamer-ai/contracts";
import type { StreamerApi } from "../api/client";
import { safeErrorMessage } from "../api/client";
import { TitleCard } from "./TitleCard";

interface LibraryPageProps {
  api: StreamerApi;
  profileId: string;
  version: number;
  onBackHome: () => void;
}

export function LibraryPage({
  api,
  profileId,
  version,
  onBackHome,
}: LibraryPageProps) {
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "movie" | "series">("all");
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const [nextLibrary, nextHistory] = await Promise.all([
        api.getLibrary(profileId),
        api.getHistory(profileId),
      ]);
      setLibrary(nextLibrary);
      setHistory(nextHistory);
      setMessage("");
    } catch (error) {
      setMessage(safeErrorMessage(error));
    }
  };

  useEffect(() => {
    void load();
  }, [api, profileId, version]);

  const remove = async (item: CatalogTitle) => {
    try {
      await api.removeFromLibrary(profileId, item.id);
      await load();
    } catch (error) {
      setMessage(safeErrorMessage(error));
    }
  };

  const play = async (item: CatalogTitle) => {
    try {
      await api.startPlayback(profileId, item.id);
      setMessage(`${item.title} passed playback preflight.`);
      await load();
    } catch (error) {
      setMessage(safeErrorMessage(error));
    }
  };

  const items =
    library?.items.filter(
      (entry) => filter === "all" || entry.title.kind === filter,
    ) ?? [];

  return (
    <main className="library-page">
      <header className="library-heading">
        <div>
          <p className="eyebrow">Your personal collection</p>
          <h1>Library</h1>
          <p>
            Saved, started and completed titles stay here independently of
            providers.
          </p>
        </div>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => setHistoryOpen(true)}
        >
          Watch History
        </button>
      </header>
      <div className="filter-bar" aria-label="Filter library">
        {(["all", "movie", "series"] as const).map((value) => (
          <button
            className={filter === value ? "is-active" : ""}
            type="button"
            key={value}
            onClick={() => setFilter(value)}
          >
            {value === "all"
              ? "All titles"
              : value === "movie"
                ? "Movies"
                : "Series"}
          </button>
        ))}
      </div>
      {message && (
        <p className="page-message" role="status">
          {message}
        </p>
      )}
      {items.length > 0 ? (
        <div className="library-grid">
          {items.map((entry) => (
            <TitleCard
              key={entry.title.id}
              item={entry.title}
              onPlay={play}
              onAdd={() => undefined}
              onRemove={remove}
            />
          ))}
        </div>
      ) : (
        <section className="library-empty">
          <span aria-hidden="true">＋</span>
          <h2>Your Library is ready for its first title.</h2>
          <p>
            Ask for a recommendation on Home, then save it or start watching.
          </p>
          <button
            className="button button--primary"
            type="button"
            onClick={onBackHome}
          >
            Discover something
          </button>
        </section>
      )}

      {historyOpen && (
        <div
          className="history-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setHistoryOpen(false);
          }}
        >
          <aside className="history-panel" aria-labelledby="history-heading">
            <div className="history-panel__header">
              <div>
                <p className="eyebrow">Chronological activity</p>
                <h2 id="history-heading">Watch History</h2>
              </div>
              <button
                type="button"
                aria-label="Close history"
                onClick={() => setHistoryOpen(false)}
              >
                ×
              </button>
            </div>
            {history?.items.length ? (
              <ol className="history-list">
                {history.items.map((event) => (
                  <li key={event.id}>
                    <span
                      className="history-thumb"
                      style={{ background: event.title.accentColor }}
                    >
                      {event.title.title.slice(0, 1)}
                    </span>
                    <div>
                      <strong>{event.title.title}</strong>
                      <small>
                        {event.episodeLabel ??
                          `${Math.round(event.progressPercent)}% watched`}
                      </small>
                    </div>
                    <time dateTime={event.occurredAt}>
                      {new Date(event.occurredAt).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-inline">Playback events will appear here.</p>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
