"use client";

interface StatusBadgeProps {
  graduated?: boolean;
  progress?: number;
  size?: "xs" | "sm" | "md";
}

export function StatusBadge({
  graduated = false,
  progress = 0,
  size = "sm",
}: StatusBadgeProps) {
  const sizeClass = {
    xs: "px-1.5 py-0.5 text-[9px]",
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-1 text-xs",
  }[size];

  if (graduated) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-[#4ade80]/40 bg-[#14291e] font-mono font-bold text-[#4ade80] uppercase tracking-wider ${sizeClass}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
        GRADUATED
      </span>
    );
  }

  if (progress >= 75) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-[#db9d6a]/40 bg-[#3b2718] font-mono font-bold text-[#db9d6a] uppercase tracking-wider ${sizeClass}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[#db9d6a]" />
        {progress.toFixed(0)}% HOT
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-[#24262e] bg-[#1a1b21] font-mono font-semibold text-[#a1a1aa] uppercase tracking-wider ${sizeClass}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#71717a]" />
      IN CURVE
    </span>
  );
}
