/**
 * Frequency -> note conversion on the 12-TET grid (architecture §4.4, AC-1).
 *
 * Pure function — zero DOM/Web Audio.
 *
 * NOTE (§4.4 runtime-path NIT): this helper spells accidentals with SHARPS
 * only. It is a standalone AC-1 utility and MUST NOT feed the tuner note
 * readout — the display shows the selected `GuitarString` from the tuning data
 * (flat-spelled where relevant, e.g. E♭). Mixing the two would clash sharp and
 * flat spellings in one display.
 */
import type { Accidental } from '../tuning/types';

/** Chromatic names on the 12-TET grid, sharp-spelled. */
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;

export interface NoteReading {
  note: string;
  accidental: Accidental;
  octave: number;
  cents: number;
}

/**
 * Convert a frequency to its nearest 12-TET note plus signed cent deviation.
 *
 * @param hz Frequency in Hz (assumed finite and > 0).
 * @param a4 Reference pitch for A4. Defaults to 440 Hz (D-14).
 */
export function freqToNote(hz: number, a4: number = 440): NoteReading {
  const midi = 69 + 12 * Math.log2(hz / a4);
  const nearest = Math.round(midi);
  const cents = (midi - nearest) * 100;

  const name = NAMES[((nearest % 12) + 12) % 12];
  const octave = Math.floor(nearest / 12) - 1;

  // NAMES entries are either a bare letter (length 1) or letter + '♯' (length 2).
  const accidental: Accidental = name.length > 1 ? '♯' : '';
  const note = name[0];

  return { note, accidental, octave, cents };
}
