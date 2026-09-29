import { useEffect, useState } from "react";
import type { ConnectionState, StreamerApi } from "../../api/client";
import { safeErrorMessage } from "../../api/client";
import { StatusBadge, type UiStatus } from "./StatusBadge";

interface ConnectionsStepProps {
  api: StreamerApi;
  initialTmdbState: ConnectionState;
  initialWebshareState: ConnectionState;
  onTmdbConnected: () => void;
  onWebshareConnected: () => void;
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
  onWebshareConnected,
}: ConnectionsStepProps) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<UiStatus>(uiStatusFor(initialTmdbState));
  const [message, setMessage] = useState(
    initialTmdbState === "connected" ? "Your movie catalogue is ready." : "",
  );
  const [isMemoryOnly, setIsMemoryOnly] = useState(false);
  const [webshareUsername, setWebshareUsername] = useState("");
  const [websharePassword, setWebsharePassword] = useState("");
  const [showWebsharePassword, setShowWebsharePassword] = useState(false);
  const [webshareStatus, setWebshareStatus] = useState<UiStatus>(
    uiStatusFor(initialWebshareState),
  );
  const [webshareMessage, setWebshareMessage] = useState("");

  useEffect(() => {
    setStatus(uiStatusFor(initialTmdbState));
  }, [initialTmdbState]);

  useEffect(() => {
    setWebshareStatus(uiStatusFor(initialWebshareState));
  }, [initialWebshareState]);

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

  const connectWebshare = async () => {
    if (!webshareUsername.trim() || !websharePassword) {
      setWebshareStatus("error");
      setWebshareMessage("Enter your Webshare username and password first.");
      return;
    }
    setWebshareStatus("working");
    setWebshareMessage("Signing in through your home server…");
    try {
      const result = await api.connectWebshare(
        webshareUsername.trim(),
        websharePassword,
      );
      setWebsharePassword("");
      setShowWebsharePassword(false);
      if (!result.ok) {
        setWebshareStatus("error");
        setWebshareMessage(
          result.messageCode === "CREDENTIAL_REJECTED"
            ? "Webshare did not accept these credentials. Check them and try again."
            : result.messageCode === "TIMEOUT"
              ? "Webshare did not respond in time. Nothing was saved."
              : "Webshare could not be connected. Nothing was saved.",
        );
        return;
      }
      setWebshareStatus("success");
      setWebshareMessage(
        result.persistence === "memory"
          ? "Connected for this development session."
          : "Connected. The session token is stored in the encrypted local vault.",
      );
      onWebshareConnected();
    } catch (error) {
      setWebsharePassword("");
      setShowWebsharePassword(false);
      setWebshareStatus("error");
      setWebshareMessage(safeErrorMessage(error));
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

        <section className="connection-card" aria-labelledby="webshare-heading">
          <div className="connection-card__header">
            <div className="service-identity">
              <span className="service-mark service-mark--outline">WS</span>
              <div>
                <h2 id="webshare-heading">Webshare</h2>
                <p>Playback source for your personal library.</p>
              </div>
            </div>
            <StatusBadge status={webshareStatus} />
          </div>
          {webshareStatus !== "success" && (
            <div className="connection-form connection-form--webshare">
              <p className="muted-note connection-form__intro">
                Sign in locally. Your password is used only to obtain a Webshare
                session token and is never stored.
              </p>
              <label className="field">
                <span>Username or email</span>
                <input
                  type="text"
                  autoComplete="username"
                  value={webshareUsername}
                  onChange={(event) => setWebshareUsername(event.target.value)}
                />
              </label>
              <label className="field webshare-password-field">
                <span>Password</span>
                <span className="input-with-action input-with-action--icon">
                  <input
                    type={showWebsharePassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={websharePassword}
                    onChange={(event) =>
                      setWebsharePassword(event.target.value)
                    }
                  />
                  <button
                    className="password-visibility-toggle"
                    type="button"
                    aria-label={
                      showWebsharePassword
                        ? "Hide Webshare password"
                        : "Show Webshare password"
                    }
                    aria-pressed={showWebsharePassword}
                    title={
                      showWebsharePassword ? "Hide password" : "Show password"
                    }
                    onClick={() =>
                      setShowWebsharePassword((visible) => !visible)
                    }
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      aria-hidden="true"
                    >
                      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                      <circle cx="12" cy="12" r="2.75" />
                      {showWebsharePassword && (
                        <path className="eye-slash" d="m4 4 16 16" />
                      )}
                    </svg>
                  </button>
                </span>
              </label>
              <button
                className="button button--secondary"
                type="button"
                onClick={connectWebshare}
                disabled={webshareStatus === "working"}
              >
                {webshareStatus === "working"
                  ? "Connecting…"
                  : "Connect Webshare"}
              </button>
            </div>
          )}
          {webshareMessage && (
            <p
              className={`inline-message inline-message--${webshareStatus}`}
              role={webshareStatus === "error" ? "alert" : "status"}
            >
              {webshareMessage}
            </p>
          )}
          {webshareStatus === "success" && (
            <div
              className="connected-summary"
              aria-label="Webshare connection details"
            >
              <span>Provider</span>
              <strong>Webshare · Connected</strong>
            </div>
          )}
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
