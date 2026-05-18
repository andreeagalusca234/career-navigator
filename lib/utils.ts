export function compactText(value: string, maxLength = 1200): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

export function createId(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function roDate(date: Date | string): string {
  return new Intl.DateTimeFormat("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}
