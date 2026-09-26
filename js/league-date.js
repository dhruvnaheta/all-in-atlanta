const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function atlantaDateKey(now = new Date()) {
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
// Game dates are calendar dates, not instants. Preserve ISO date-only strings
// and legacy English labels regardless of the viewer's timezone.
export function leagueDateKey(value) {
  if (typeof value !== "string") return null;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    const legacy =
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})$/.exec(
        value,
      );
    if (legacy)
      match = [
        "",
        legacy[3],
        String(
          [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ].indexOf(legacy[1]) + 1,
        ).padStart(2, "0"),
        legacy[2].padStart(2, "0"),
      ];
  }
  if (!match) return null;
  const key = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === key
    ? key
    : null;
}

// Unknown dates sort last; compare calendar dates without timezone conversion.
export function newestGameFirst(a, b) {
  return (leagueDateKey(b.date) || "").localeCompare(
    leagueDateKey(a.date) || "",
  );
}

export function formatLeagueDate(value) {
  const key = leagueDateKey(value);
  if (!key) return value || "";
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC", month: "short", day: "numeric", year: "numeric",
  });
}
