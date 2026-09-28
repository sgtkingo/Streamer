import { useState } from "react";
import { apiClient, type ProfileDraft, type StreamerApi } from "./api/client";
import { AppShell } from "./components/AppShell";
import { Onboarding } from "./components/onboarding/Onboarding";

export interface AppProps {
  api?: StreamerApi;
  forceOnboarding?: boolean;
}

export function App({ api = apiClient, forceOnboarding = false }: AppProps) {
  const [isComplete, setIsComplete] = useState(
    !forceOnboarding &&
      (window.localStorage.getItem("streamer-ai:onboarding-complete") ===
        "true" ||
        window.localStorage.getItem("streamer:onboarding-complete") === "true"),
  );
  const [viewerName, setViewerName] = useState("Viewer");

  const completeOnboarding = (profile: ProfileDraft) => {
    setViewerName(profile.name.trim() || "Viewer");
    setIsComplete(true);
  };

  return isComplete ? (
    <AppShell api={api} viewerName={viewerName} />
  ) : (
    <Onboarding api={api} onComplete={completeOnboarding} />
  );
}
