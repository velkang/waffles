export function PanelLoading({ lines }: { lines: number }) {
  return (
    <div className="space-y-3" aria-label="Loading">
      <div className="h-5 w-2/5 animate-pulse rounded bg-[#24262e]" />
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="h-3 animate-pulse rounded bg-[#1a1b21]"
          style={{ width: `${90 - (index % 3) * 14}%` }}
        />
      ))}
    </div>
  );
}

export function PanelError({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert">
      <div className="font-bold text-red-300">{title}</div>
      <p className="mt-2 text-xs leading-5 text-zinc-500">
        {message}. Check the API connection and try again.
      </p>
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="p-8 text-center">
      <div className="font-bold text-white">{title}</div>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-zinc-500">
        {message}
      </p>
    </div>
  );
}
