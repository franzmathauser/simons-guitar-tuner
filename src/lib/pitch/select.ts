/**
 * Auto target-string selection (architecture §4.6, AC-3).
 *
 * Pure function — zero DOM/Web Audio.
 */
import type { GuitarString } from '../tuning/types';
import { centsBetween } from './cents';

/**
 * Pick the string whose target pitch is closest to `hz`.
 *
 * @returns the index of the nearest string when its absolute cent distance is
 *   within `windowCents`; otherwise `null` (the note is too far from any open
 *   string to auto-select).
 */
export function selectTarget(
  hz: number,
  strings: GuitarString[],
  windowCents: number = 80,
): number | null {
  let bestIdx = -1;
  let bestAbs = Infinity;

  for (let i = 0; i < strings.length; i++) {
    const abs = Math.abs(centsBetween(hz, strings[i].targetHz));
    if (abs < bestAbs) {
      bestAbs = abs;
      bestIdx = i;
    }
  }

  if (bestIdx === -1) return null;
  return bestAbs <= windowCents ? bestIdx : null;
}
