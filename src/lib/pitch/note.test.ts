import { describe, it, expect } from 'vitest';
import { freqToNote } from './note';

describe('freqToNote (architecture §4.4, AC-1)', () => {
  it('82.41 Hz -> E2 within <1 cent', () => {
    const r = freqToNote(82.41);
    expect(r.note).toBe('E');
    expect(r.accidental).toBe('');
    expect(r.octave).toBe(2);
    expect(Math.abs(r.cents)).toBeLessThan(1);
  });

  it('146.83 Hz -> D3 within <1 cent', () => {
    const r = freqToNote(146.83);
    expect(r.note).toBe('D');
    expect(r.accidental).toBe('');
    expect(r.octave).toBe(3);
    expect(Math.abs(r.cents)).toBeLessThan(1);
  });

  it('329.63 Hz -> E4 within <1 cent', () => {
    const r = freqToNote(329.63);
    expect(r.note).toBe('E');
    expect(r.accidental).toBe('');
    expect(r.octave).toBe(4);
    expect(Math.abs(r.cents)).toBeLessThan(1);
  });

  it('151.0 Hz -> D3 at approximately +48.5 cents', () => {
    const r = freqToNote(151.0);
    expect(r.note).toBe('D');
    expect(r.octave).toBe(3);
    expect(r.cents).toBeGreaterThan(0);
    expect(r.cents).toBeCloseTo(48.45, 1);
  });

  it('spells accidentals with SHARPS only (§4.4 runtime-path NIT)', () => {
    // +60 cents above A4 rounds up across the name boundary to A#4, not B-flat.
    const r = freqToNote(440 * Math.pow(2, 60 / 1200));
    expect(r.note).toBe('A');
    expect(r.accidental).toBe('♯');
    expect(r.octave).toBe(4);
    expect(r.cents).toBeCloseTo(-40, 4);
  });

  it('stays on the note just below the +50 cent rounding edge', () => {
    // +40 cents above A4 is still A4 (does not yet round up).
    const r = freqToNote(440 * Math.pow(2, 40 / 1200));
    expect(r.note).toBe('A');
    expect(r.accidental).toBe('');
    expect(r.octave).toBe(4);
    expect(r.cents).toBeCloseTo(40, 4);
  });

  it('handles the octave boundary B3 -> C4 correctly', () => {
    const b3 = freqToNote(246.94);
    expect(b3.note).toBe('B');
    expect(b3.octave).toBe(3);

    const c4 = freqToNote(261.63);
    expect(c4.note).toBe('C');
    expect(c4.accidental).toBe('');
    expect(c4.octave).toBe(4);
  });

  it('respects a non-default reference pitch (a4 argument)', () => {
    // With a4=432, exactly 432 Hz must read as A4 / 0 cents.
    const r = freqToNote(432, 432);
    expect(r.note).toBe('A');
    expect(r.octave).toBe(4);
    expect(Math.abs(r.cents)).toBeLessThan(1e-9);
  });
});
