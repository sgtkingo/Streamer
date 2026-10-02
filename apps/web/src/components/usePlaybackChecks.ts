import { useCallback, useRef, useState } from "react";
import type { CatalogTitle } from "@streamer-ai/contracts";
import type { StreamerApi } from "../api/client";
import { safeErrorMessage } from "../api/client";

export type PlaybackCheckState =
  | { status: "checking" }
  | { status: "ready" }
  | { status: "failed"; message: string };

/** Checks visible page titles without minting or invalidating playback grants. */
export function usePlaybackChecks(api: StreamerApi, profileId: string) {
  const [states, setStates] = useState<Map<string, PlaybackCheckState>>(
    () => new Map(),
  );
  const statesRef = useRef(states);
  const queue = useRef<CatalogTitle[]>([]);
  const active = useRef(0);
  const pumpRef = useRef<() => void>(() => undefined);

  statesRef.current = states;

  pumpRef.current = () => {
    while (active.current < 3 && queue.current.length > 0) {
      const title = queue.current.shift();
      if (!title) continue;
      active.current += 1;
      void api
        .checkPlayback(profileId, title.id)
        .then(() => {
          const next = new Map(statesRef.current);
          next.set(title.id, { status: "ready" });
          statesRef.current = next;
          setStates(next);
        })
        .catch((error: unknown) => {
          const next = new Map(statesRef.current);
          next.set(title.id, {
            status: "failed",
            message: safeErrorMessage(error),
          });
          statesRef.current = next;
          setStates(next);
        })
        .finally(() => {
          active.current -= 1;
          pumpRef.current();
        });
    }
  };

  const check = useCallback((title: CatalogTitle) => {
    const current = statesRef.current.get(title.id);
    if (current?.status === "checking" || current?.status === "ready") return;
    const next = new Map(statesRef.current);
    next.set(title.id, { status: "checking" });
    statesRef.current = next;
    setStates(next);
    queue.current.push(title);
    pumpRef.current();
  }, []);

  const markFailed = useCallback((titleId: string, message: string) => {
    const next = new Map(statesRef.current);
    next.set(titleId, { status: "failed", message });
    statesRef.current = next;
    setStates(next);
  }, []);

  return { states, check, markFailed };
}
