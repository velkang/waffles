import { memo } from "react";

/**
 * Reel ticker: renders a preformatted string as fixed-width character cells;
 * any character that changes re-mounts and rolls in like a split-flap reel.
 */
export const Reel = memo(function Reel({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex tabular-nums ${className}`} aria-label={value}>
      {value.split("").map((char, i) => (
        <span
          key={`${i}-${char}`}
          className="reel-char inline-block min-w-[0.56em] text-center"
          aria-hidden="true"
        >
          {char}
        </span>
      ))}
    </span>
  );
});
