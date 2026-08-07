const MAX_TIMER_DELAY_MS = 2_147_483_647;

export function validateTimerDelay(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_TIMER_DELAY_MS) {
    throw new TypeError(`${label} must be finite, positive, and no greater than ${MAX_TIMER_DELAY_MS}`);
  }
  return value;
}
