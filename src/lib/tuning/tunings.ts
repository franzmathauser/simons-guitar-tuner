/**
 * Tuning presets (architecture §4.2, AC-7).
 *
 * Target frequencies and labels match the mockup TUNINGS table exactly
 * (A4 = 440). Pure data — zero DOM/Web Audio.
 */
import type { Accidental, GuitarString, Tuning, TuningId } from './types';

/** Concise constructor for a single string entry. */
function str(note: string, accidental: Accidental, octave: number, targetHz: number): GuitarString {
  return { note, accidental, octave, targetHz };
}

export const TUNINGS: Record<TuningId, Tuning> = {
  standard: {
    id: 'standard',
    label: 'E A D G B E',
    strings: [
      str('E', '', 2, 82.41),
      str('A', '', 2, 110.0),
      str('D', '', 3, 146.83),
      str('G', '', 3, 196.0),
      str('B', '', 3, 246.94),
      str('E', '', 4, 329.63),
    ],
  },
  dropd: {
    id: 'dropd',
    label: 'Drop D',
    strings: [
      str('D', '', 2, 73.42),
      str('A', '', 2, 110.0),
      str('D', '', 3, 146.83),
      str('G', '', 3, 196.0),
      str('B', '', 3, 246.94),
      str('E', '', 4, 329.63),
    ],
  },
  halfstep: {
    id: 'halfstep',
    label: '½ Ton tiefer',
    strings: [
      str('E', '♭', 2, 77.78),
      str('A', '♭', 2, 103.83),
      str('D', '♭', 3, 138.59),
      str('G', '♭', 3, 185.0),
      str('B', '♭', 3, 233.08),
      str('E', '♭', 4, 311.13),
    ],
  },
  openg: {
    id: 'openg',
    label: 'Open G',
    strings: [
      str('D', '', 2, 73.42),
      str('G', '', 2, 98.0),
      str('D', '', 3, 146.83),
      str('G', '', 3, 196.0),
      str('B', '', 3, 246.94),
      str('D', '', 4, 293.66),
    ],
  },
};

/** Display order of tuning presets in the header dropdown. */
export const TUNING_ORDER: TuningId[] = ['standard', 'dropd', 'halfstep', 'openg'];
