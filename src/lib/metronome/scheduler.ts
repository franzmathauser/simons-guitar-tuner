/**
 * Metronome timing engine — Chris Wilson "two-clock" lookahead scheduler (AC-10, AC-13).
 *
 * Architecture contract: docs/impl/architecture.md §0, §4.11.
 *
 * Beat INSTANTS are computed purely as `nextNote += 60 / bpm` and compared against the
 * audio clock via `now()`. They are NEVER derived from a timer. The `setWaker` callback
 * (a worker-backed `setInterval`, or a `setTimeout` fallback) is used ONLY to re-invoke
 * the scheduling scan — it is a "waker", never the source of beat times. This is the
 * hard NEVER rule from §0: `setInterval`/`setTimeout` must not be the time source for
 * beat instants.
 */

/** Clamp a BPM value to the supported range [40, 240], rounded to the nearest integer. */
export function clampBpm(v: number): number {
  return Math.min(240, Math.max(40, Math.round(v)));
}

/**
 * Injected side-effecting dependencies. Keeping them injectable makes the scheduler a
 * pure, deterministic state machine that can be driven by a fake audio clock in tests.
 */
export interface SchedulerDeps {
  /** Current time on the audio clock (e.g. `AudioContext.currentTime`), in seconds. */
  now: () => number;
  /** Schedule an audible click at an absolute audio-clock `time`; `accent` = downbeat. */
  scheduleClick: (time: number, accent: boolean) => void;
  /** Register a repeating waker that invokes `cb` roughly every `ms`; returns an id. */
  setWaker: (cb: () => void, ms: number) => number;
  /** Cancel a waker previously created by `setWaker`. */
  clearWaker: (id: number) => void;
}

export interface SchedulerOptions {
  /** Beats per bar; beat 0 of each bar is the accented downbeat. Default 4. */
  beatsPerBar?: number;
  /** Waker cadence in milliseconds — how often the scan re-runs. Default 25. */
  lookahead?: number;
  /** How far ahead (seconds) of `now()` beats are pre-scheduled. Default 0.1. */
  aheadTime?: number;
}

export type BeatCallback = (beat: number, time: number) => void;

const DEFAULT_BPM = 120;

export class MetronomeScheduler {
  readonly #deps: SchedulerDeps;
  readonly #beatsPerBar: number;
  readonly #lookahead: number; // ms — waker cadence only
  readonly #aheadTime: number; // s — scheduling horizon on the audio clock

  #bpm = DEFAULT_BPM;
  #running = false;
  #nextNote = 0; // absolute audio-clock time (s) of the next beat to schedule
  #beatCounter = 0; // monotonic global beat index since start()
  #wakerId: number | null = null;
  readonly #beatCallbacks: BeatCallback[] = [];

  constructor(deps: SchedulerDeps, opts: SchedulerOptions = {}) {
    this.#deps = deps;
    this.#beatsPerBar = opts.beatsPerBar ?? 4;
    this.#lookahead = opts.lookahead ?? 25;
    this.#aheadTime = opts.aheadTime ?? 0.1;
  }

  get bpm(): number {
    return this.#bpm;
  }

  /** Set the tempo; value is clamped to [40, 240] and takes effect on the next beat. */
  setBpm(v: number): void {
    this.#bpm = clampBpm(v);
  }

  get running(): boolean {
    return this.#running;
  }

  /** Subscribe to beats. `beat` cycles 0..beatsPerBar-1; 0 is the downbeat. */
  onBeat(cb: BeatCallback): void {
    this.#beatCallbacks.push(cb);
  }

  /**
   * Start scheduling. `startTime` (audio-clock seconds) anchors the first downbeat;
   * defaults to `now()`. Idempotent while already running.
   */
  start(startTime?: number): void {
    if (this.#running) return;
    this.#running = true;
    this.#nextNote = startTime ?? this.#deps.now();
    this.#beatCounter = 0;
    // The waker only re-invokes the scan — it is not the beat time source.
    this.#wakerId = this.#deps.setWaker(() => this.#scan(), this.#lookahead);
    // Run one scan immediately so the opening beats are queued without waiting a tick.
    this.#scan();
  }

  /** Stop scheduling and clear the waker. Idempotent. */
  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    if (this.#wakerId !== null) {
      this.#deps.clearWaker(this.#wakerId);
      this.#wakerId = null;
    }
  }

  /**
   * Schedule every beat whose instant falls before `now() + aheadTime`. Beat instants
   * advance by exact arithmetic (`+= 60/bpm`) on the audio clock — the waker cadence and
   * any jitter in when this scan runs cannot perturb the scheduled times.
   */
  #scan(): void {
    if (!this.#running) return; // guard against a stale waker tick after stop()
    const horizon = this.#deps.now() + this.#aheadTime;
    while (this.#nextNote < horizon) {
      const beatInBar = this.#beatCounter % this.#beatsPerBar;
      const accent = beatInBar === 0;
      const time = this.#nextNote;
      this.#deps.scheduleClick(time, accent);
      for (const cb of this.#beatCallbacks) cb(beatInBar, time);
      this.#nextNote += 60 / this.#bpm;
      this.#beatCounter += 1;
    }
  }
}
