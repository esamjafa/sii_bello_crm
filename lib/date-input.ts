/** datetime-local uses the browser's local time, not UTC. */
export function dateInput(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Preserve seconds and the original offset during an unchanged edit (including
 * the repeated hour when daylight saving ends). */
export function dateInputToISO(value: string, original?: unknown): string | null {
  if (!value) return null;
  if (original && value === dateInput(original)) return new Date(String(original)).toISOString();
  return new Date(value).toISOString();
}
