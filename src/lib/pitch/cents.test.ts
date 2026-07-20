import { describe, it, expect } from 'vitest';
import { centsBetween } from './cents';

describe('centsBetween (architecture §4.3)', () => {
  it('returns 0 cents for identical frequencies', () => {
    expect(centsBetween(440, 440)).toBe(0);
    expect(centsBetween(82.41, 82.41)).toBe(0);
  });

  it('returns +1200 cents for one octave up', () => {
    expect(centsBetween(880, 440)).toBeCloseTo(1200, 6);
  });

  it('returns -1200 cents for one octave down', () => {
    expect(centsBetween(220, 440)).toBeCloseTo(-1200, 6);
  });

  it('returns +100 cents for one equal-tempered semitone up', () => {
    const semitoneUp = 440 * Math.pow(2, 1 / 12);
    expect(centsBetween(semitoneUp, 440)).toBeCloseTo(100, 6);
  });

  it('is sign-correct: sharp is positive, flat is negative', () => {
    expect(centsBetween(441, 440)).toBeGreaterThan(0);
    expect(centsBetween(439, 440)).toBeLessThan(0);
  });

  it('matches the 1200*log2(hz/refHz) definition', () => {
    const hz = 123.45;
    const ref = 110;
    expect(centsBetween(hz, ref)).toBeCloseTo(1200 * Math.log2(hz / ref), 9);
  });
});
