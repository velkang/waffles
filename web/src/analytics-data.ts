export function protocolDetails(raw: string) {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    return {
      tokens:
        typeof record.tokens === "string" && /^\d+$/.test(record.tokens)
          ? record.tokens
          : null,
      destination:
        typeof record.destination === "string" &&
        /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(record.destination)
          ? record.destination
          : null,
      incentives:
        typeof record.incentives === "boolean" ? record.incentives : null,
    };
  } catch {
    return null;
  }
}
