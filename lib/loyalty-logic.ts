// lib/loyalty-logic.ts
// Pure functions extracted from route handlers for testability.

export interface ScanInput {
  programType: 'points' | 'stamps';
  currentPoints: number;
  currentStamps: number;
  pointsPerScan: number;
  rewardThreshold: number;
  stampsTotal: number;
}

export interface ScanResult {
  pointsDelta: number;
  stampsDelta: number;
  newPoints: number;
  newStamps: number;
  rewardTriggered: boolean;
  stampCardCompleted: boolean;
}

/**
 * Compute the result of a loyalty scan.
 *
 * Points mode:
 *   - pointsDelta is always pointsPerScan
 *   - rewardTriggered fires once when cumulative total crosses rewardThreshold
 *
 * Stamps mode:
 *   - Normal scan: stampsDelta = +1, stamps_count goes N -> N+1
 *   - Completing scan: stampsDelta = 1 - stampsTotal (e.g. total=10 -> delta=-9 -> 9+(-9)=0)
 *   - stampCardCompleted = true when currentStamps + 1 >= stampsTotal
 */
export function computeScanResult(input: ScanInput): ScanResult {
  const {
    programType,
    currentPoints,
    currentStamps,
    pointsPerScan,
    rewardThreshold,
    stampsTotal,
  } = input;

  const pointsDelta = pointsPerScan;
  const newPoints = currentPoints + pointsDelta;

  // Points-mode reward: fires once when the cumulative threshold is crossed.
  // Scoped to 'points' mode only — stamps mode uses stampCardCompleted.
  const rewardTriggered =
    programType === 'points' &&
    currentPoints < rewardThreshold &&
    newPoints >= rewardThreshold;

  // Stamps-mode completion:
  //   currentStamps + 1 >= stampsTotal  ->  card is full, reset to 0.
  const stampCardCompleted =
    programType === 'stamps' && currentStamps + 1 >= stampsTotal;

  // stamps_delta encoding:
  //   Normal scan:      +1                  -> stamps_count goes N -> N+1
  //   Completing scan:  1 - stampsTotal     -> stamps_count goes (stampsTotal-1) -> 0
  //     e.g. total=10 -> delta=-9 -> 9 + (-9) = 0
  const stampsDelta =
    programType !== 'stamps'
      ? 0
      : stampCardCompleted
        ? 1 - stampsTotal
        : 1;

  const newStamps = currentStamps + stampsDelta;

  return {
    pointsDelta,
    stampsDelta,
    newPoints,
    newStamps,
    rewardTriggered,
    stampCardCompleted,
  };
}

/**
 * Calculate an end time given a start time string ("HH:MM") and a duration in minutes.
 *
 * Used by booking routes to compute appointment end times.
 * Does NOT handle day overflow (assumes appointments stay within a single day).
 */
export function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const endMinutes = h * 60 + m + durationMinutes;
  return `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
}
