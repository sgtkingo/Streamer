export function WelcomeStep() {
  return (
    <div className="step-copy step-copy--welcome">
      <p className="eyebrow">Private by design</p>
      <h1 tabIndex={-1}>
        Your cinema.
        <br />
        On your terms.
      </h1>
      <p className="step-lead">
        StreamerAI brings conversational discovery, your Library and a private
        AI curator together on your home server.
      </p>
      <div className="trust-note">
        <span className="trust-icon" aria-hidden="true">
          ⌂
        </span>
        <div>
          <strong>Your viewing data stays at home.</strong>
          <p>
            Connections are encrypted and credentials are kept by the server —
            never in this browser.
          </p>
        </div>
      </div>
    </div>
  );
}
