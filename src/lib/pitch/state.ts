/**
 * In-tune classification (architecture §4.5, AC-2).
 *
 * Pure function — zero DOM/Web Audio.
 */

/** Tuning verdict for a cent deviation. */
export type TuneState = 'ok' | 'low' | 'high';

/**
 * Shared in-tune half-band, in cents (D-12). This is the SINGLE source of the
 * ±5¢ "ok" threshold — {@link centsToState} and `HysteresisState` both consume
 * it so the entry semantics can never drift apart (architecture §4.7).
 */
export const IN_TUNE_CENTS = 5;

/**
 * Classify a cent deviation into a tuning state.
 *
 * `|cents| <= inTune` => 'ok'; otherwise 'low' when flat, 'high' when sharp.
 *
 * @param cents  Signed deviation from target (negative = flat).
 * @param inTune Half-band width in cents. Defaults to the shared
 *   {@link IN_TUNE_CENTS} constant; a caller (e.g. `HysteresisState`) may pass
 *   its own band so the "ok" test stays coupled to the caller's threshold.
 */
export function centsToState(cents: number, inTune: number = IN_TUNE_CENTS): TuneState {
  if (Math.abs(cents) <= inTune) return 'ok';
  return cents < 0 ? 'low' : 'high';
}
