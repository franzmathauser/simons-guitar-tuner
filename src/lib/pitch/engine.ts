/**
 * Pure tuner engine (architecture §4.8, AC-4 + AC-6).
 *
 * Consumes {hz, clarity} frames and produces smoothed, hysteresis-stabilised
 * tuner readings. Zero DOM/Web Audio; deterministic (no clocks/RNG) so it runs
 * unchanged in node/jsdom.
 */
import type { GuitarString, Tuning } from '../tuning/types';
import type { TuneState } from './state';
import { centsBetween } from './cents';
import { selectTarget } from './select';
import { HysteresisState, MedianSmoother } from './smooth';

export interface TunerReading {
  hasSignal: boolean;
  stringIndex: number;
  note: GuitarString;
  /** Smoothed deviation from the target in cents (drives the needle). */
  cents: number;
  /** `Math.round(cents)` for display. */
  displayCents: number;
  state: TuneState;
  /** Median-smoothed measured frequency in Hz. */
  measuredHz: number;
}

export interface TunerEngineOptions {
  clarityThreshold?: number; // default 0.9
  autoWindowCents?: number; // default 80
  medianSize?: number; // default 5
  hysteresisMargin?: number; // default 3
}

export class TunerEngine {
  private tuning: Tuning;
  private readonly clarityThreshold: number;
  private readonly autoWindowCents: number;
  private readonly median: MedianSmoother;
  private readonly hysteresis: HysteresisState;
  private _manualOverride: number | null = null;
  private last: TunerReading;

  constructor(tuning: Tuning, opts: TunerEngineOptions = {}) {
    this.tuning = tuning;
    this.clarityThreshold = opts.clarityThreshold ?? 0.9;
    this.autoWindowCents = opts.autoWindowCents ?? 80;
    this.median = new MedianSmoother(opts.medianSize ?? 5);
    this.hysteresis = new HysteresisState(undefined, opts.hysteresisMargin ?? 3);
    this.last = this.initialReading();
  }

  /** The well-defined baseline reading returned before any valid signal. */
  private initialReading(): TunerReading {
    return {
      hasSignal: false,
      stringIndex: 0,
      note: this.tuning.strings[0],
      cents: 0,
      displayCents: 0,
      state: 'ok',
      measuredHz: 0,
    };
  }

  private clampIndex(idx: number): number {
    const max = this.tuning.strings.length - 1;
    return Math.min(Math.max(idx, 0), max);
  }

  /** Swap the active tuning; clamps the retained string index into range. */
  setTuning(t: Tuning): void {
    this.tuning = t;
    const idx = this.clampIndex(this.last.stringIndex);
    this.last = { ...this.last, stringIndex: idx, note: t.strings[idx] };
    if (this._manualOverride != null) {
      this._manualOverride = this.clampIndex(this._manualOverride);
    }
  }

  /** Lock onto a specific string (`null` re-enables auto-selection). */
  setManualOverride(idx: number | null): void {
    this._manualOverride = idx == null ? null : this.clampIndex(idx);
  }

  get manualOverride(): number | null {
    return this._manualOverride;
  }

  update(frame: { hz: number; clarity: number }): TunerReading {
    const { hz, clarity } = frame;

    // 1. Clarity / validity gate (AC-6). pitchy returns [0,0] on no-pitch,
    //    caught here by clarity < threshold and hz <= 0.
    if (clarity < this.clarityThreshold || !Number.isFinite(hz) || hz <= 0) {
      this.median.reset(); // drop stale samples so resume isn't polluted
      this.last = { ...this.last, hasSignal: false };
      return this.last;
    }

    // 2. Smooth.
    const medianHz = this.median.push(hz);

    // 3. Target selection: manual override locks it (AC-4); else auto-select,
    //    keeping the previous index (default 0) when out of every window.
    let stringIndex: number;
    if (this._manualOverride != null) {
      stringIndex = this._manualOverride;
    } else {
      const sel = selectTarget(medianHz, this.tuning.strings, this.autoWindowCents);
      stringIndex = sel != null ? sel : this.last.stringIndex;
    }

    // 4-6. Deviation, hysteresis state, store & return.
    const note = this.tuning.strings[stringIndex];
    const cents = centsBetween(medianHz, note.targetHz);
    const state = this.hysteresis.update(cents);

    this.last = {
      hasSignal: true,
      stringIndex,
      note,
      cents,
      displayCents: Math.round(cents),
      state,
      measuredHz: medianHz,
    };
    return this.last;
  }

  /**
   * Reset the signal-processing pipeline (median, hysteresis, last reading) to
   * the defined initial state. The manual override is deliberately preserved —
   * it is an explicit user selection, not pipeline state.
   */
  reset(): void {
    this.median.reset();
    this.hysteresis.reset();
    this.last = this.initialReading();
  }
}
