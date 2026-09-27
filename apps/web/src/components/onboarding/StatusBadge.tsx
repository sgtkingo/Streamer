export type UiStatus = 'idle' | 'working' | 'success' | 'error' | 'unavailable';

const statusLabel: Record<UiStatus, string> = {
  idle: 'Not connected',
  working: 'Checking…',
  success: 'Connected',
  error: 'Needs attention',
  unavailable: 'Coming next'
};

export function StatusBadge({ status, label }: { status: UiStatus; label?: string }) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {label ?? statusLabel[status]}
    </span>
  );
}
