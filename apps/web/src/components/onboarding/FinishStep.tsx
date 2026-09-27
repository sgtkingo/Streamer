import type { ProfileDraft } from '../../api/client';
import { StatusBadge } from './StatusBadge';

interface FinishStepProps {
  profile: ProfileDraft;
  tmdbConnected: boolean;
  localAiEnabled: boolean;
  error: string;
}

export function FinishStep({ profile, tmdbConnected, localAiEnabled, error }: FinishStepProps) {
  return (
    <div className="step-copy step-copy--finish">
      <p className="eyebrow">Ready for the first frame</p>
      <h1 tabIndex={-1}>Welcome home{profile.name ? `, ${profile.name}` : ''}.</h1>
      <p className="step-lead">Your private cinema is configured. Streamer will begin building the library in the background.</p>

      <dl className="setup-summary">
        <div>
          <dt>Profile</dt>
          <dd>{profile.name || 'Local viewer'} · {profile.locale.toUpperCase()}</dd>
          <StatusBadge status="success" label="Ready" />
        </div>
        <div>
          <dt>Movie metadata</dt>
          <dd>{tmdbConnected ? 'TMDB connected' : 'Can be connected later'}</dd>
          <StatusBadge status={tmdbConnected ? 'success' : 'idle'} label={tmdbConnected ? 'Ready' : 'Optional'} />
        </div>
        <div>
          <dt>Local AI</dt>
          <dd>{localAiEnabled ? 'Private curator enabled' : 'Disabled for now'}</dd>
          <StatusBadge status={localAiEnabled ? 'success' : 'idle'} label={localAiEnabled ? 'Ready' : 'Optional'} />
        </div>
      </dl>

      <p className="finish-note">Initial indexing continues in the background. You can safely close this window at any time.</p>
      {error && <p className="inline-message inline-message--error" role="alert">{error}</p>}
    </div>
  );
}
