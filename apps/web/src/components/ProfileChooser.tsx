import { useState } from "react";
import type { ViewerProfile } from "@streamer-ai/contracts";
import { Brand } from "./Brand";

interface ProfileChooserProps {
  profiles: ViewerProfile[];
  onSelect: (profile: ViewerProfile) => void;
  onCreate: (name: string) => Promise<void>;
  error?: string;
  onRetry?: () => void;
}

export function ProfileChooser({
  profiles,
  onSelect,
  onCreate,
  error,
  onRetry,
}: ProfileChooserProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [createError, setCreateError] = useState("");

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true);
    setCreateError("");
    try {
      await onCreate(name.trim());
      setAdding(false);
      setName("");
    } catch (reason) {
      setCreateError(
        reason instanceof Error
          ? reason.message
          : "Profile could not be created.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="profile-chooser">
      <Brand />
      <div className="profile-chooser__content">
        <p className="eyebrow">Your private cinema</p>
        <h1>Who's watching?</h1>
        <p>
          Choose a profile to keep its discoveries, Library and watch history
          separate.
        </p>
        {error && (
          <p className="page-message page-message--error" role="alert">
            {error}{" "}
            {onRetry && (
              <button type="button" onClick={onRetry}>
                Try again
              </button>
            )}
          </p>
        )}
        <div className="profile-chooser__grid" aria-label="Choose a profile">
          {Array.from({ length: 5 }, (_, index) => {
            const profile = profiles[index];
            if (profile)
              return (
                <button
                  className="profile-medallion"
                  type="button"
                  key={profile.id}
                  onClick={() => onSelect(profile)}
                >
                  <span className="profile-medallion__portrait">
                    {profile.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>{profile.name}</span>
                  {!profile.onboardingComplete && <small>Finish setup</small>}
                </button>
              );
            if (index === profiles.length)
              return (
                <button
                  className="profile-medallion profile-medallion--add"
                  type="button"
                  key="add"
                  onClick={() => setAdding(true)}
                >
                  <span
                    className="profile-medallion__portrait"
                    aria-hidden="true"
                  >
                    +
                  </span>
                  <span>Add profile</span>
                </button>
              );
            return (
              <div
                className="profile-medallion profile-medallion--empty"
                key={index}
                aria-hidden="true"
              >
                <span className="profile-medallion__portrait">·</span>
                <span>Available</span>
              </div>
            );
          })}
        </div>
        <small>
          {profiles.length} of 5 profiles · Profiles are not password-protected
          yet.
        </small>
      </div>
      {adding && (
        <div className="profile-chooser__overlay" role="presentation">
          <form
            className="profile-chooser__form"
            onSubmit={(event) => void create(event)}
            aria-label="Create profile"
            role="dialog"
            aria-modal="true"
            onKeyDown={(event) => {
              if (event.key === "Escape") setAdding(false);
            }}
          >
            <h2>Add a profile</h2>
            <p>Give this viewer a name, then complete their setup.</p>
            <label className="field">
              <span>Profile name</span>
              <input
                autoFocus
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {createError && (
              <p className="page-message page-message--error" role="alert">
                {createError}
              </p>
            )}
            <div className="profile-chooser__actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
              <button
                className="button button--primary"
                type="submit"
                disabled={!name.trim() || pending}
              >
                {pending ? "Creating…" : "Create profile"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
