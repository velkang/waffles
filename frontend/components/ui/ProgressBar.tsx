"use client";

interface ProgressBarProps {
  progress: number; // 0 to 100
  graduated?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  showTicks?: boolean;
}

export function ProgressBar({
  progress,
  graduated = false,
  size = "md",
  className = "",
  showTicks = true,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress));

  const heightClass = {
    sm: "h-1.5",
    md: "h-2",
    lg: "h-3",
  }[size];

  // Flat color states (strictly zero gradients)
  const fillColor = graduated
    ? "bg-[#4ade80]" // Mint Emerald
    : clamped >= 75
      ? "bg-[#db9d6a]" // Warm Copper
      : clamped >= 50
        ? "bg-[#f59e0b]" // Amber
        : "bg-[#db9d6a]/80"; // Sand Copper

  return (
    <div className={`relative w-full overflow-hidden rounded-full bg-[#1a1b21] border border-[#24262e] ${heightClass} ${className}`}>
      {/* Milestone tick marks at 25%, 50%, 75% */}
      {showTicks && !graduated && (
        <>
          <div className="absolute top-0 bottom-0 left-1/4 w-[1px] bg-[#24262e] z-10" />
          <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-[#24262e] z-10" />
          <div className="absolute top-0 bottom-0 left-3/4 w-[1px] bg-[#24262e] z-10" />
        </>
      )}

      {/* Progress fill */}
      <div
        className={`h-full transition-all duration-300 rounded-full ${fillColor}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
