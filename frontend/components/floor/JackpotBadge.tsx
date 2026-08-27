export function JackpotBadge({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-4 w-4 items-center justify-center rounded-full bg-gold text-floor ${className}`}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path
          d="M5 1.5L5.9 3.7H8.3L6.35 5.05L6.95 7.3L5 5.95L3.05 7.3L3.65 5.05L1.7 3.7H4.1L5 1.5Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="0.3"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
