export function Brand({ className = "" }: { className?: string }) {
  return (
    <div className={`brand ${className}`.trim()} aria-label="StreamerAI">
      <span className="brand-name">
        STREAMER<span>AI</span>
      </span>
    </div>
  );
}
