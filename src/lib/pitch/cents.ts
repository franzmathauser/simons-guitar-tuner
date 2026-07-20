/**
 * Cent-deviation primitive (architecture §4.3).
 *
 * Pure function — zero DOM/Web Audio. The core building block for note
 * detection, target selection and the tuner engine.
 */

/**
 * Musical interval between two frequencies expressed in cents.
 *
 * 100 cents = one equal-tempered semitone, 1200 cents = one octave.
 * Positive => `hz` is sharp relative to `refHz`; negative => flat.
 */
export function centsBetween(hz: number, refHz: number): number {
  return 1200 * Math.log2(hz / refHz);
}
