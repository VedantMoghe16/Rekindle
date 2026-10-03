export function formatINR(value: number): string {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (absolute >= 10_000_000) {
    return `${sign}₹${trim(absolute / 10_000_000)} Cr`;
  }
  if (absolute >= 100_000) {
    return `${sign}₹${trim(absolute / 100_000)} L`;
  }
  return `${sign}₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(absolute)}`;
}

function trim(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value);
}

export function formatShortDate(value: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}
