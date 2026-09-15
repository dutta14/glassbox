/**
 * Relative day label for a note's timestamp.
 *
 * Used by the search modal. The rail dropped its dates when its rows became
 * single-line, so this lives here rather than inside that component: the
 * codebase already carries several divergent copies of date formatting and
 * this is the canonical one. Day boundaries are compared at local midnight
 * rather
 * than by subtracting milliseconds, so "Yesterday" stays correct across
 * daylight-saving shifts.
 */
export const formatRelative = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startNoteDay = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
  ).getTime();
  const days = Math.round((startToday - startNoteDay) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
