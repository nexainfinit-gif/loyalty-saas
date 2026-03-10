import { describe, it, expect } from 'vitest';
import { computeScanResult, calculateEndTime, ScanInput } from '@/lib/loyalty-logic';

// ---------------------------------------------------------------------------
// computeScanResult
// ---------------------------------------------------------------------------
describe('computeScanResult', () => {
  // -- Points mode ----------------------------------------------------------

  describe('points mode', () => {
    const base: ScanInput = {
      programType: 'points',
      currentPoints: 0,
      currentStamps: 0,
      pointsPerScan: 10,
      rewardThreshold: 100,
      stampsTotal: 10,
    };

    it('normal scan: adds points without triggering reward', () => {
      const result = computeScanResult({ ...base, currentPoints: 50 });

      expect(result.pointsDelta).toBe(10);
      expect(result.newPoints).toBe(60);
      expect(result.rewardTriggered).toBe(false);
      expect(result.stampsDelta).toBe(0);
      expect(result.newStamps).toBe(0);
      expect(result.stampCardCompleted).toBe(false);
    });

    it('reward trigger: crossing threshold from below', () => {
      const result = computeScanResult({ ...base, currentPoints: 95 });

      expect(result.newPoints).toBe(105);
      expect(result.rewardTriggered).toBe(true);
    });

    it('already past threshold: reward does NOT re-trigger', () => {
      const result = computeScanResult({ ...base, currentPoints: 110 });

      expect(result.newPoints).toBe(120);
      expect(result.rewardTriggered).toBe(false);
    });

    it('exact threshold crossing: 90 + 10 = 100', () => {
      const result = computeScanResult({ ...base, currentPoints: 90 });

      expect(result.newPoints).toBe(100);
      expect(result.rewardTriggered).toBe(true);
    });
  });

  // -- Stamps mode ----------------------------------------------------------

  describe('stamps mode', () => {
    const base: ScanInput = {
      programType: 'stamps',
      currentPoints: 0,
      currentStamps: 0,
      pointsPerScan: 1,
      rewardThreshold: 100,
      stampsTotal: 10,
    };

    it('normal stamp: 5/10 -> 6/10', () => {
      const result = computeScanResult({ ...base, currentStamps: 5 });

      expect(result.stampsDelta).toBe(1);
      expect(result.newStamps).toBe(6);
      expect(result.stampCardCompleted).toBe(false);
      // In stamps mode, rewardTriggered should never fire
      expect(result.rewardTriggered).toBe(false);
    });

    it('card completion: 9/10 -> reset to 0, completed=true', () => {
      const result = computeScanResult({ ...base, currentStamps: 9 });

      expect(result.stampCardCompleted).toBe(true);
      expect(result.newStamps).toBe(0);
    });

    it('stampsDelta on completion is (1 - stampsTotal)', () => {
      const result = computeScanResult({ ...base, currentStamps: 9 });

      // 1 - 10 = -9;  9 + (-9) = 0
      expect(result.stampsDelta).toBe(1 - 10);
      expect(result.stampsDelta).toBe(-9);
    });

    it('fresh start after completion: 0/10 -> 1/10', () => {
      const result = computeScanResult({ ...base, currentStamps: 0 });

      expect(result.stampsDelta).toBe(1);
      expect(result.newStamps).toBe(1);
      expect(result.stampCardCompleted).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// calculateEndTime
// ---------------------------------------------------------------------------
describe('calculateEndTime', () => {
  it('normal: 09:00 + 30min = 09:30', () => {
    expect(calculateEndTime('09:00', 30)).toBe('09:30');
  });

  it('hour boundary: 09:45 + 30min = 10:15', () => {
    expect(calculateEndTime('09:45', 30)).toBe('10:15');
  });

  it('multi-hour: 10:00 + 90min = 11:30', () => {
    expect(calculateEndTime('10:00', 90)).toBe('11:30');
  });

  it('late evening: 22:00 + 60min = 23:00', () => {
    expect(calculateEndTime('22:00', 60)).toBe('23:00');
  });
});
