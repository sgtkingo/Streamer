import { useEffect, useState } from "react";
import type { StreamerApi } from "../api/client";
import { Brand } from "./Brand";
import { HomePage } from "./HomePage";
import { LibraryPage } from "./LibraryPage";

type Route = "home" | "library";

function routeFromLocation(): Route {
  return window.location.pathname.startsWith("/library") ? "library" : "home";
}

export function AppShell({
  api,
  viewerName = "Viewer",
  playbackEnabled = false,
}: {
  api: StreamerApi;
  viewerName?: string;
  playbackEnabled?: boolean;
}) {
  const [route, setRoute] = useState<Route>(routeFromLocation);
  const [libraryVersion, setLibraryVersion] = useState(0);
  const profileId = "default";

  useEffect(() => {
    const update = () => setRoute(routeFromLocation());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  const navigate = (next: Route) => {
    window.history.pushState({}, "", next === "library" ? "/library" : "/");
    setRoute(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand-button"
          type="button"
          onClick={() => navigate("home")}
          aria-label="StreamerAI home"
        >
          <Brand />
        </button>
        <nav aria-label="Primary navigation" className="primary-nav">
          <button
            type="button"
            className={route === "home" ? "is-active" : ""}
            aria-current={route === "home" ? "page" : undefined}
            onClick={() => navigate("home")}
          >
            Home
          </button>
          <button
            type="button"
            className={route === "library" ? "is-active" : ""}
            aria-current={route === "library" ? "page" : undefined}
            onClick={() => navigate("library")}
          >
            Library
          </button>
        </nav>
        {route === "home" && (
          <nav aria-label="Home sections" className="section-nav">
            <a href="#continue-watching">Continue</a>
            <a href="#new-releases">New</a>
            <a href="#trending">Trending</a>
            <a href="#top-rated">Top Rated</a>
            <a href="#for-you">For You</a>
          </nav>
        )}
        <span
          className="avatar"
          role="img"
          aria-label={`Current profile: ${viewerName}`}
        >
          {viewerName.slice(0, 1).toUpperCase()}
        </span>
      </header>

      {route === "home" ? (
        <HomePage
          api={api}
          profileId={profileId}
          onLibraryChanged={() => setLibraryVersion((value) => value + 1)}
        />
      ) : (
        <LibraryPage
          api={api}
          profileId={profileId}
          version={libraryVersion}
          onBackHome={() => navigate("home")}
          playbackEnabled={playbackEnabled}
        />
      )}
    </div>
  );
}
