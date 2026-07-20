import { describe, it, expect } from 'vitest';
import { selectTarget } from './select';
import { TUNINGS } from '../tuning/tunings';

const STD = TUNINGS.standard.strings;

describe('selectTarget (architecture §4.6, AC-3)', () => {
  it('maps each exact standard-tuning target to its own index', () => {
    STD.forEach((s, i) => {
      expect(selectTarget(s.targetHz, STD)).toBe(i);
    });
  });

  it('maps a slightly detuned frequency to the nearest string index', () => {
    // ~16 cents sharp of A2 (110 Hz) -> still string index 1.
    expect(selectTarget(111, STD)).toBe(1);
    // ~14 cents flat of D3 (146.83 Hz) -> still string index 2.
    expect(selectTarget(145.6, STD)).toBe(2);
  });

  it('returns null for a frequency far outside every string window (500 Hz)', () => {
    expect(selectTarget(500, STD)).toBeNull();
  });

  it('returns the index at the inclusive edge of the ±80¢ window', () => {
    // Exactly 79 cents sharp of E2 stays nearest to E2 and is inside the window.
    const inside = STD[0].targetHz * Math.pow(2, 79 / 1200);
    expect(selectTarget(inside, STD)).toBe(0);
  });

  it('returns null just outside the ±80¢ window of the nearest string', () => {
    // 90 cents sharp of E2 is still nearest to E2 (gap to A2 is ~500¢) but
    // outside the 80¢ window -> null.
    const outside = STD[0].targetHz * Math.pow(2, 90 / 1200);
    expect(selectTarget(outside, STD)).toBeNull();
  });

  it('honours a custom window width', () => {
    const at50 = STD[0].targetHz * Math.pow(2, 50 / 1200);
    expect(selectTarget(at50, STD, 40)).toBeNull();
    expect(selectTarget(at50, STD, 60)).toBe(0);
  });
});
