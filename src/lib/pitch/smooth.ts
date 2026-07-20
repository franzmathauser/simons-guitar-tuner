/**
 * Signal smoothing + tuning-state hysteresis (architecture §4.7, AC-5,
 * D-18/D-20).
 *
 * Pure classes — zero DOM/Web Audio, deterministic (no clocks/RNG).
 */
import type { TuneState } from './state';
import { centsToState, IN_TUNE_CENTS } from './state';

/**
 * Sliding-window median filter over the last `size` frequency samples.
 * Median (not mean) rejects transient octave-jump / glitch outliers (D-18).
 */
export class MedianSmoother {
  private readonly size: number;
  private buf: number[] = [];

  constructor(size: number = 5) {
    this.size = size;
  }

  /** Push a sample and return the median of the current window. */
  push(hz: number): number {
    this.buf.push(hz);
    if (this.buf.length > this.size) this.buf.shift();

    const sorted = [...this.buf].sort((a, b) => a - b);
    const n = sorted.length;
    const mid = n >> 1;
    return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /** Drop all buffered samples. */
  reset(): void {
    this.buf = [];
  }
}

/**
 * Directional hysteresis over the tuning verdict (D-20).
 *
 * Keeps the ±`inTune`¢ ENTRY threshold (D-12) while requiring the deviation to
 * exceed `inTune + margin`¢ to LEAVE 'ok' — an anti-flicker band that also
 * snaps directly to the opposite side when the sign flips past 'ok', so it can
 * never get stuck showing 'low' while sharp (or vice versa).
 *
 * `raw` is computed via the shared {@link centsToState} using this instance's
 * `inTune`, so the two can never drift apart.
 */
export class HysteresisState {
  private readonly inTune: number;
  private readonly margin: number;
  private _state: TuneState = 'ok';

  constructor(inTune: number = IN_TUNE_CENTS, margin: number = 3) {
    this.inTune = inTune;
    this.margin = margin;
  }

  update(cents: number): TuneState {
    const raw = centsToState(cents, this.inTune);
    const S = this._state;

    // No change requested by the raw verdict.
    if (raw === S) return S;

    if (S === 'ok') {
      // Sticky: leave 'ok' only when clearly out of tune.
      if (Math.abs(cents) > this.inTune + this.margin) {
        this._state = cents < 0 ? 'low' : 'high';
      }
      // else: hold 'ok' (anti-flicker band inTune..inTune+margin).
    } else {
      // Currently 'low' or 'high'.
      if (raw === 'ok') {
        // Enter 'ok' as soon as |cents| <= inTune (keeps ±5 semantics).
        this._state = 'ok';
      } else {
        // Opposite side (sign flipped past 'ok') -> SNAP, never stay wrong-signed.
        this._state = raw;
      }
    }

    return this._state;
  }

  get state(): TuneState {
    return this._state;
  }

  reset(): void {
    this._state = 'ok';
  }
}
