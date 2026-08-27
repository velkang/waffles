const BULB_COUNT = 32;

function litCount(progress: number): number {
  return Math.round((Math.min(Math.max(progress, 0), 100) / 100) * BULB_COUNT);
}

/**
 * Jackpot meter: a marquee bulb strip tracking bonding-curve progress.
 * Graduated machines run the gold chase across every bulb.
 */
export function BulbMeter({
  progress,
  graduated,
  label,
}: {
  progress: number | undefined;
  graduated: boolean;
  label?: string;
}) {
  const lit = litCount(progress ?? 0);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress !== undefined ? Math.round(progress) : undefined}
      aria-label={label ?? "Graduation progress"}
      className="flex items-center gap-[3px]"
    >
      {Array.from({ length: BULB_COUNT }, (_, i) => (
        <span
          key={i}
          className={
            graduated
              ? "bulb-chase h-1.5 w-1.5 rounded-full bg-gold"
              : i < lit
                ? "h-1.5 w-1.5 rounded-full bg-gold shadow-[0_0_4px_rgba(245,197,66,0.75)]"
                : "h-1.5 w-1.5 rounded-full border border-gold/40 bg-gold/[0.08]"
          }
          style={
            graduated ? { animationDelay: `${(i % 8) * 0.2}s` } : undefined
          }
        />
      ))}
    </div>
  );
}
