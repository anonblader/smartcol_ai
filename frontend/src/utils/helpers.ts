/** Shared formatting and classification helpers used across multiple pages. */

/** Convert minutes to hours string (e.g. 150 → "2.5"). */
export function mins2h(m: number): string {
  return (Number(m) / 60).toFixed(1);
}

/** Return a colour indicating load level based on peak and total work hours. */
export function loadColor(peakMins: number, workMins: number): string {
  const peak = Number(peakMins) / 60;
  const work = Number(workMins) / 60;
  if (peak > 10) return '#ef4444';
  if (peak > 8)  return '#f59e0b';
  if (work < 5)  return '#3b82f6';
  return '#10b981';
}

/** Return a human-readable load label based on peak and total work hours. */
export function loadLabel(peakMins: number, workMins: number): string {
  const peak = Number(peakMins) / 60;
  const work = Number(workMins) / 60;
  if (peak > 10) return 'Overloaded';
  if (peak > 8)  return 'High Load';
  if (work < 5)  return 'Underloaded';
  return 'Balanced';
}
