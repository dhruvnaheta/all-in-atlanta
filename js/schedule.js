export const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function nextOccurrence(dayOfWeek) {
  // Returns Date of the next (or today's) occurrence of dayOfWeek (0=Sun)
  const now = new Date();
  const today = now.getDay();
  let diff = dayOfWeek - today;
  if (diff < 0) diff += 7;
  // If it's today but past 11pm, show next week
  if (diff === 0 && now.getHours() >= 23) diff = 7;
  const d = new Date(now);
  d.setDate(d.getDate() + diff);
  return d;
}

export function fmtDate(d) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const WEEKLY_GAMES = [
  { day: 1, venue: "Wicked Wolf", time: "8:00 PM" },
  { day: 3, venue: "5 Paces", time: "8:00 PM" },
  { day: 4, venue: "Wicked Wolf", time: "8:00 PM" },
];
export function venueLabel(venue) {
  return /^5\s*paces$/i.test(venue) ? "5 Paces" : venue;
}
