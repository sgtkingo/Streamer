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
            Your profile and history are stored by your configured home server.
            Provider credentials are never saved in this browser.
          </p>
        </div>
      </div>
    </div>
  );
}
