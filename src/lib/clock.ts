const INDIA_TZ = "Asia/Kolkata";

export function now(): Date {
  const frozen = process.env.DEMO_TODAY;
  if (!frozen) return new Date();
  return new Date(`${frozen}T12:00:00+05:30`);
}

export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now());
}

export function greetingDate(): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIA_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now());
}
