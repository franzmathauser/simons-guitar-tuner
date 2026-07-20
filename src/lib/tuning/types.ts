/**
 * Core tuning domain types (architecture §4.1).
 *
 * Pure type declarations — zero runtime, zero DOM/Web Audio. Safe to import
 * from any layer (logic, audio, components).
 */

/** Accidental glyph for a note. Empty string = natural. */
export type Accidental = '' | '♭' | '♯';

/** Identifier of a supported tuning preset. */
export type TuningId = 'standard' | 'dropd' | 'halfstep' | 'openg';

/** A single guitar string within a tuning. */
export interface GuitarString {
  note: string;
  accidental: Accidental;
  octave: number;
  /** Target frequency in Hz at A4 = 440. */
  targetHz: number;
}

/** A named tuning preset: exactly 6 strings ordered low -> high. */
export interface Tuning {
  id: TuningId;
  label: string;
  /** Length 6, ordered low -> high. */
  strings: GuitarString[];
}
