import { describe, it, expect } from 'vitest';
import type { TuningId } from './types';
import { TUNINGS, TUNING_ORDER } from './tunings';

/** Expected data straight from architecture §4.2 (A4 = 440). */
const EXPECTED: Record<
  TuningId,
  { label: string; strings: [string, string, number, number][] }
> = {
  standard: {
    label: 'E A D G B E',
    strings: [
      ['E', '', 2, 82.41],
      ['A', '', 2, 110.0],
      ['D', '', 3, 146.83],
      ['G', '', 3, 196.0],
      ['B', '', 3, 246.94],
      ['E', '', 4, 329.63],
    ],
  },
  dropd: {
    label: 'Drop D',
    strings: [
      ['D', '', 2, 73.42],
      ['A', '', 2, 110.0],
      ['D', '', 3, 146.83],
      ['G', '', 3, 196.0],
      ['B', '', 3, 246.94],
      ['E', '', 4, 329.63],
    ],
  },
  halfstep: {
    label: '½ Ton tiefer',
    strings: [
      ['E', '♭', 2, 77.78],
      ['A', '♭', 2, 103.83],
      ['D', '♭', 3, 138.59],
      ['G', '♭', 3, 185.0],
      ['B', '♭', 3, 233.08],
      ['E', '♭', 4, 311.13],
    ],
  },
  openg: {
    label: 'Open G',
    strings: [
      ['D', '', 2, 73.42],
      ['G', '', 2, 98.0],
      ['D', '', 3, 146.83],
      ['G', '', 3, 196.0],
      ['B', '', 3, 246.94],
      ['D', '', 4, 293.66],
    ],
  },
};

describe('TUNINGS data (architecture §4.2, AC-7)', () => {
  it('TUNING_ORDER is exactly the four ids low-priority order', () => {
    expect(TUNING_ORDER).toEqual(['standard', 'dropd', 'halfstep', 'openg']);
  });

  it('every ordered id resolves to a tuning whose id matches the key', () => {
    for (const id of TUNING_ORDER) {
      expect(TUNINGS[id]).toBeDefined();
      expect(TUNINGS[id].id).toBe(id);
    }
  });

  for (const id of ['standard', 'dropd', 'halfstep', 'openg'] as TuningId[]) {
    describe(`${id}`, () => {
      const tuning = () => TUNINGS[id];
      const exp = EXPECTED[id];

      it('has the exact header label', () => {
        expect(tuning().label).toBe(exp.label);
      });

      it('has exactly 6 strings ordered low -> high by target Hz', () => {
        const strings = tuning().strings;
        expect(strings).toHaveLength(6);
        for (let i = 1; i < strings.length; i++) {
          expect(strings[i].targetHz).toBeGreaterThan(strings[i - 1].targetHz);
        }
      });

      it('matches each string note/accidental/octave and target Hz (2 decimals)', () => {
        const strings = tuning().strings;
        exp.strings.forEach(([note, accidental, octave, hz], i) => {
          expect(strings[i].note).toBe(note);
          expect(strings[i].accidental).toBe(accidental);
          expect(strings[i].octave).toBe(octave);
          expect(strings[i].targetHz).toBeCloseTo(hz, 2);
        });
      });
    });
  }

  it('halfstep uses the flat glyph on every string', () => {
    for (const s of TUNINGS.halfstep.strings) {
      expect(s.accidental).toBe('♭');
    }
  });
});
