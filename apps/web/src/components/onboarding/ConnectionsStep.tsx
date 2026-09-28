import { useEffect, useState } from "react";
import type { ConnectionState, StreamerApi } from "../../api/client";
import { safeErrorMessage } from "../../api/client";
import { StatusBadge, type UiStatus } from "./StatusBadge";

interface ConnectionsStepProps {
  api: StreamerApi;
  initialTmdbState: ConnectionState;
  initialWebshareState: ConnectionState;
  onTmdbConnected: () => void;
}

function uiStatusFor(state: ConnectionState): UiStatus {
  if (state === "connected") return "success";
  if (state === "unavailable") return "unavailable";
  return "idle";
}

export function ConnectionsStep({
  api,
  initialTmdbState,
  initialWebshareState,
  onTmdbConnected,
}: ConnectionsStepProps) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<UiStatus>(uiStatusFor(initialTmdbState));
  const [message, setMessage] = useState(
    initialTmdbState === "connected" ? "Your movie catalogue is ready." : "",
  );
  const [isMemoryOnly, setIsMemoryOnly] = useState(false);

  useEffect(() => {
    setStatus(uiStatusFor(initialTmdbState));
  }, [initialTmdbState]);

  const connect = async () => {
    const cleanToken = token.trim().replace(/^Bearer\s+/i, "");
    if (!cleanToken) {
      setStatus("error");
      setMessage("Paste your TMDB Read Access Token first.");
      return;
    }

    setStatus("working");
    setMessage("Testing the token with TMDB…");
    try {
      const result = await api.connectTmdb(cleanToken);
      if (!result.ok) {
        const publicMessages = {
          CREDENTIAL_REQUIRED: "Paste your TMDB Read Access Token first.",
          CREDENTIAL_REJECTED:
            "TMDB did not accept this token. Copy the Read Access Token and try again.",
          RATE_LIMITED:
            "TMDB is receiving too many requests. Wait a moment and try again.",
          TIMEOUT:
            "TMDB did not respond in time. Your token was not saved; try again.",
          INVALID_RESPONSE:
            "TMDB returned an unexpected response. Your token was not saved.",
          PROVIDER_UNAVAILABLE:
            "TMDB is unavailable right now. Your token was not saved; try again later.",
          SECURE_STORAGE_UNAVAILABLE:
            "The token was verified but the home server could not store it securely.",
          UNKNOWN: "TMDB could not be connected. Your token was not saved.",
        } as const;
        setStatus("error");
        setMessage(publicMessages[result.messageCode]);
        return;
      }
      // Clear the secret before changing any status UI.
      setToken("");
      setShowToken(false);
      setStatus("success");
      setIsMemoryOnly(result.persistence === "memory");
      setMessage(
        result.persistence === "memory"
          ? "Connection verified for this development session."
          : "Connection verified. Your token is now stored securely by the home server.",
      );
      onTmdbConnected();
    } catch (error) {
      setStatus("error");
      setMessage(safeErrorMessage(error));
    }
  };

  return (
    <div className="step-copy">
      <p className="eyebrow">Bring your services</p>
      <h1 tabIndex={-1}>
        Connect once.
        <br />
        We handle the rest.
      </h1>
      <p className="step-lead">
        StreamerAI uses these services to validate titles and find playable
        versions. You stay in control.
      </p>

      <div className="connection-list">
        <section className="connection-card" aria-labelledby="tmdb-heading">
          <div className="connection-card__header">
            <div className="service-identity">
              <span className="service-mark">TM</span>
              <div>
                <h2 id="tmdb-heading">The Movie Database</h2>
                <p>Movie and series details, artwork and cast.</p>
              </div>
            </div>
            <StatusBadge status={status} />
          </div>

          {status !== "success" && (
            <div className="connection-form">
              <div className="connection-help">
                <strong>Get your free token</strong>
                <ol>
                  <li>Sign in to TMDB and request an API key.</li>
                  <li>Copy the API Read Access Token from your settings.</li>
                  <li>
                    Paste it below. StreamerAI tests and saves it for you.
                  </li>
                </ol>
                <a
                  href="https://www.themoviedb.org/settings/api"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open TMDB API settings <span aria-hidden="true">↗</span>
                </a>
              </div>
              <label className="field token-field">
                <span>TMDB Read Access Token</span>
                <span className="input-with-action">
                  <input
                    type={showToken ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="Paste token"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((visible) => !visible)}
                  >
                    {showToken ? "Hide" : "Show"}
                  </button>
                </span>
              </label>
              <button
                className="button button--secondary"
                type="button"
                onClick={connect}
                disabled={status === "working"}
              >
                {status === "working" ? "Verifying…" : "Verify and connect"}
              </button>
            </div>
          )}

          {message && (
            <p
              className={`inline-message inline-message--${status}`}
              role={status === "error" ? "alert" : "status"}
            >
              {message}
            </p>
          )}
          {status === "success" && (
            <div
              className="connected-summary"
              aria-label="TMDB connection details"
            >
              <span>Provider</span>
              <strong>TMDB · Connected</strong>
            </div>
          )}
          {status === "success" && isMemoryOnly && (
            <p className="inline-message inline-message--warning" role="status">
              Development mode: this credential is held in memory only and will
              be forgotten when the server restarts.
            </p>
          )}
        </section>

        <section
          className="connection-card connection-card--muted"
          aria-labelledby="webshare-heading"
        >
          <div className="connection-card__header">
            <div className="service-identity">
              <span className="service-mark service-mark--outline">WS</span>
              <div>
                <h2 id="webshare-heading">Webshare</h2>
                <p>Playback source for your personal library.</p>
              </div>
            </div>
            <StatusBadge status={uiStatusFor(initialWebshareState)} />
          </div>
          <p className="muted-note">
            {initialWebshareState === "connected"
              ? "Connected. Playback will be enabled after the live coordinator completes its capability check."
              : "The adapter and safe playback tickets are ready; guided sign-in still requires the authorized account capability test. You can finish setup and connect it later."}
          </p>
        </section>
      </div>

      <p className="privacy-line">
        <span aria-hidden="true">◆</span> Tokens are sent to your home server
        for verification and are never saved in browser storage. Use HTTPS
        whenever the app is accessed beyond the same trusted device.
      </p>
    </div>
  );
}
