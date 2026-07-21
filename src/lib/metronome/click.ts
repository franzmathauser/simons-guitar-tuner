/**
 * Metronome click synthesis (architecture §4.11). Kept component-agnostic so it can be
 * unit-tested against a fake audio clock — the same isolation doctrine as scheduler.ts.
 *
 * One short oscillator "ping" per beat: the accent (downbeat) is higher and louder.
 * Envelope ported from the approved mockup.
 *
 * iOS hardening (D-…, fixes "one click then silence while the dots keep animating"):
 * a beat `time` can slip behind `ac.currentTime` — iOS is born suspended with the clock
 * frozen at 0 and `resume()` lands asynchronously, and scan jitter can add more slip.
 * Writing `setValueAtTime`/`exponentialRampToValueAtTime`/`start` at a *past* timestamp
 * leaves the gain pinned at its ~0 floor, so the oscillator RUNS BUT RENDERS SILENTLY
 * (the beat callback still fires → the visual keeps ticking). Clamping the whole envelope
 * to `max(time, now)` makes a late beat audible (a hair late) instead of muted.
 */

/**
 * The minimal slice of the Web Audio API a click needs. Declaring it here (instead of
 * depending on the full `AudioContext`) keeps `playClick` trivially fake-able in tests.
 */
export interface ClickAudio {
  readonly currentTime: number;
  readonly destination: AudioNode;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
}

export const ACCENT_HZ = 1500;
export const BEAT_HZ = 900;
export const ACCENT_GAIN = 0.5;
export const BEAT_GAIN = 0.32;
/** Exponential ramps cannot touch 0; this is the audible-silence floor. */
export const GAIN_FLOOR = 0.0001;

/**
 * Schedule one click on `ac` at (or just after) `time`. `accent` marks the downbeat.
 * `time` is clamped up to `ac.currentTime` so a beat that already slipped into the past
 * still sounds instead of rendering silently.
 */
export function playClick(ac: ClickAudio, time: number, accent: boolean): void {
  const t = Math.max(time, ac.currentTime);
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.value = accent ? ACCENT_HZ : BEAT_HZ;
  osc.connect(gain);
  gain.connect(ac.destination);
  gain.gain.setValueAtTime(GAIN_FLOOR, t);
  gain.gain.exponentialRampToValueAtTime(accent ? ACCENT_GAIN : BEAT_GAIN, t + 0.001);
  gain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, t + 0.05);
  osc.start(t);
  osc.stop(t + 0.06);
  // Release the per-click nodes once they finish. A metronome creates a fresh osc+gain on
  // every beat; leaving them connected lets nodes pile up over a long run, which on iOS
  // shows up as audio glitches/dropouts. Disconnect on `ended` so the graph stays small.
  osc.onended = (): void => {
    osc.disconnect();
    gain.disconnect();
  };
}
