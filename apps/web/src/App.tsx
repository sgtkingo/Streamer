import { useEffect, useState } from "react";
import { apiClient, type ProfileDraft, type StreamerApi } from "./api/client";
import { AppShell } from "./components/AppShell";
import { Onboarding } from "./components/onboarding/Onboarding";

export interface AppProps {
  api?: StreamerApi;
  forceOnboarding?: boolean;
}

export function App({ api = apiClient, forceOnboarding = false }: AppProps) {
  const [setupState, setSetupState] = useState<
    "loading" | "required" | "complete"
  >(forceOnboarding ? "required" : "loading");
  const [viewerName, setViewerName] = useState("Viewer");
  const [playbackEnabled, setPlaybackEnabled] = useState(false);

  useEffect(() => {
    if (forceOnboarding) return;
    let active = true;
    api
      .getSetupStatus()
      .then((status) => {
        if (!active) return;
        setViewerName(status.profile?.name.trim() || "Viewer");
        setPlaybackEnabled(status.playback);
        setSetupState(status.complete ? "complete" : "required");
      })
      .catch(() => {
        // The server is the only setup authority. If it cannot be reached,
        // onboarding remains available and its actions surface the connection error.
        if (active) setSetupState("required");
      });
    return () => {
      active = false;
    };
  }, [api, forceOnboarding]);

  const completeOnboarding = (profile: ProfileDraft) => {
    setViewerName(profile.name.trim() || "Viewer");
    setSetupState("complete");
  };

  if (setupState === "loading") {
    return (
      <main className="startup-status" aria-live="polite" aria-busy="true">
        <BrandLoading />
        <p>Connecting to your home server…</p>
      </main>
    );
  }

  return setupState === "complete" ? (
    <AppShell
      api={api}
      viewerName={viewerName}
      playbackEnabled={playbackEnabled}
    />
  ) : (
    <Onboarding api={api} onComplete={completeOnboarding} />
  );
}

function BrandLoading() {
  return <span className="startup-status__mark">StreamerAI</span>;
}
