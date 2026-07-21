import { describe, it, expect, vi } from 'vitest';
import type { SchedulerDeps } from './scheduler';
import { clampBpm, MetronomeScheduler } from './scheduler';

/**
 * Test harness that models the Chris Wilson two-clock scheduler purely with an
 * INJECTED, monotonic fake audio clock — no real timers are used for any timing
 * assertion. This is the whole point of AC-10: we prove beat instants come from
 * `now()` (the audio clock) + arithmetic, NOT from a setInterval-driven waker.
 *
 * - `now()` returns a mutable `clock` (seconds) that only WE advance.
 * - `setWaker(cb, ms)` captures the scan callback; the real worker/setInterval is
 *   never involved. We "pump" it manually.
 * - `pump(stepSec)` advances the clock by a small step and then invokes the captured
 *   waker callback once — exactly what a ~25 ms worker tick would do, but under our
 *   full control. Because the scheduler recomputes beat instants as `nextNote += 60/bpm`
 *   read against `now()`, the captured click times are exact multiples of the beat
 *   period regardless of how coarsely or jitterily we pump the waker.
 */
function makeHarness() {
  let clock = 0; // audio clock, seconds
  const clicks: Array<{ time: number; accent: boolean }> = [];
  const clearedIds: number[] = [];
  let wakerCb: (() => void) | null = null;
  let wakerMs = 0;
  let nextWakerId = 0;
  let liveWakerId: number | null = null;

  const deps: SchedulerDeps = {
    now: () => clock,
    scheduleClick: vi.fn((time: number, accent: boolean) => {
      clicks.push({ time, accent });
    }),
    setWaker: vi.fn((cb: () => void, ms: number) => {
      wakerCb = cb;
      wakerMs = ms;
      liveWakerId = ++nextWakerId;
      return liveWakerId;
    }),
    clearWaker: vi.fn((id: number) => {
      clearedIds.push(id);
      if (id === liveWakerId) liveWakerId = null;
    }),
  };

  return {
    deps,
    clicks,
    clearedIds,
    get clock() {
      return clock;
    },
    get wakerMs() {
      return wakerMs;
    },
    /** Advance the audio clock and fire the captured waker callback once. */
    pump(stepSec: number) {
      clock += stepSec;
      wakerCb?.();
    },
    /** Advance the audio clock WITHOUT firing the waker (models a stalled iOS worker). */
    advance(stepSec: number) {
      clock += stepSec;
    },
    /** Fire the waker without advancing the clock (used to prove stop() is inert). */
    pokeWaker() {
      wakerCb?.();
    },
  };
}

function stdDevMs(times: number[]): number {
  const intervals: number[] = [];
  for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance =
    intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
  return Math.sqrt(variance) * 1000; // seconds -> ms
}

describe('clampBpm (AC-13)', () => {
  it('clamps below the floor to 40', () => {
    expect(clampBpm(39)).toBe(40);
    expect(clampBpm(-100)).toBe(40);
  });
  it('clamps above the ceiling to 240', () => {
    expect(clampBpm(241)).toBe(240);
    expect(clampBpm(10000)).toBe(240);
  });
  it('passes values in range through unchanged', () => {
    expect(clampBpm(120)).toBe(120);
    expect(clampBpm(40)).toBe(40);
    expect(clampBpm(240)).toBe(240);
  });
  it('rounds to the nearest integer', () => {
    expect(clampBpm(120.4)).toBe(120);
    expect(clampBpm(120.6)).toBe(121);
    expect(clampBpm(39.9)).toBe(40);
  });
});

describe('MetronomeScheduler.setBpm clamps (AC-13)', () => {
  it('clamps via setBpm', () => {
    const h = makeHarness();
    const s = new MetronomeScheduler(h.deps);
    s.setBpm(39);
    expect(s.bpm).toBe(40);
    s.setBpm(241);
    expect(s.bpm).toBe(240);
    s.setBpm(120);
    expect(s.bpm).toBe(120);
  });
});

describe('MetronomeScheduler timing (AC-10)', () => {
  it('schedules 100 beats @120 BPM on the audio clock with inter-beat SD < 5 ms', () => {
    const h = makeHarness();
    const s = new MetronomeScheduler(h.deps, {
      beatsPerBar: 4,
      lookahead: 25,
      aheadTime: 0.1,
    });
    s.setBpm(120); // expected beat period = 0.5 s

    s.start(0); // first downbeat at t = 0 on the audio clock

    // Pump the waker in 25 ms steps (as a worker tick would) until 100 beats land.
    const stepSec = 25 / 1000;
    let guard = 0;
    while (h.clicks.length < 100 && guard < 100_000) {
      h.pump(stepSec);
      guard++;
    }

    expect(h.clicks.length).toBeGreaterThanOrEqual(100);

    const times = h.clicks.slice(0, 100).map((c) => c.time);

    // Mean interval must be the true beat period (0.5 s), proving audio-clock timing.
    const intervals: number[] = [];
    for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
    const meanMs =
      (intervals.reduce((a, b) => a + b, 0) / intervals.length) * 1000;
    expect(meanMs).toBeCloseTo(500, 3);

    const sd = stdDevMs(times);
    // Report the measured SD so the run output carries the AC-10 proof.
    // eslint-disable-next-line no-console
    console.log(`[AC-10] inter-beat interval SD over 100 beats @120 BPM = ${sd} ms`);
    expect(sd).toBeLessThan(5);
  });

  it('accents the downbeat (beat 0) and NOT beats 1..3 (AC-13 downbeat)', () => {
    const h = makeHarness();
    const s = new MetronomeScheduler(h.deps, { beatsPerBar: 4 });
    s.setBpm(120);
    s.start(0);

    const stepSec = 25 / 1000;
    let guard = 0;
    while (h.clicks.length < 100 && guard < 100_000) {
      h.pump(stepSec);
      guard++;
    }

    const first100 = h.clicks.slice(0, 100);
    first100.forEach((click, i) => {
      const isDownbeat = i % 4 === 0;
      expect(click.accent).toBe(isDownbeat);
    });
    // Sanity: at least one accented and one unaccented beat observed.
    expect(first100.some((c) => c.accent)).toBe(true);
    expect(first100.some((c) => !c.accent)).toBe(true);
  });
});

describe('MetronomeScheduler.onBeat (beat index cycling 0..3)', () => {
  it('fires onBeat with beat index cycling 0..3 and times matching scheduleClick', () => {
    const h = makeHarness();
    const beats: Array<{ beat: number; time: number }> = [];
    const s = new MetronomeScheduler(h.deps, { beatsPerBar: 4 });
    s.setBpm(120);
    s.onBeat((beat, time) => beats.push({ beat, time }));
    s.start(0);

    const stepSec = 25 / 1000;
    let guard = 0;
    while (h.clicks.length < 12 && guard < 100_000) {
      h.pump(stepSec);
      guard++;
    }

    const n = Math.min(beats.length, h.clicks.length);
    expect(n).toBeGreaterThanOrEqual(12);

    for (let i = 0; i < n; i++) {
      expect(beats[i].beat).toBe(i % 4); // 0,1,2,3,0,1,2,3,...
      expect(beats[i].time).toBe(h.clicks[i].time); // same instant as the scheduled click
    }
  });
});

describe('MetronomeScheduler.pump (rAF-driven waker)', () => {
  it('keeps scheduling when the setWaker waker never fires again (iOS worker stall)', () => {
    const h = makeHarness();
    const s = new MetronomeScheduler(h.deps, { beatsPerBar: 4 });
    s.setBpm(120); // 0.5 s per beat
    s.start(0); // start() runs one scan → beat 0 at t=0

    // The worker "stalls": from here the waker never fires again. Instead a rAF loop pumps.
    // Advance ~4 s in ~16 ms frames, pumping the scan each frame (no waker ticks at all).
    const frame = 16 / 1000;
    for (let elapsed = 0; elapsed < 4; elapsed += frame) {
      h.advance(frame);
      s.pump();
    }

    // ~4 s at 120 BPM → ~8-9 beats. Without pump() (worker stalled) this would be stuck at 1.
    expect(h.clicks.length).toBeGreaterThanOrEqual(8);
    // Beat instants stay exact multiples of the 0.5 s period — pump cadence cannot perturb them.
    for (let i = 0; i < h.clicks.length; i++) {
      expect(h.clicks[i].time).toBeCloseTo(i * 0.5, 6);
    }
  });

  it('is inert after stop()', () => {
    const h = makeHarness();
    const s = new MetronomeScheduler(h.deps, { beatsPerBar: 4 });
    s.start(0);
    const count = h.clicks.length;
    s.stop();

    h.advance(2);
    s.pump();
    expect(h.clicks.length).toBe(count);
  });
});

describe('MetronomeScheduler.stop', () => {
  it('halts scheduling and clears the waker', () => {
    const h = makeHarness();
    const s = new MetronomeScheduler(h.deps, { beatsPerBar: 4 });
    s.setBpm(120);
    s.start(0);

    const stepSec = 25 / 1000;
    let guard = 0;
    while (h.clicks.length < 8 && guard < 100_000) {
      h.pump(stepSec);
      guard++;
    }

    const countAtStop = h.clicks.length;
    expect(s.running).toBe(true);

    s.stop();
    expect(s.running).toBe(false);
    // The waker id handed out by setWaker (1) must have been cleared.
    expect(h.clearedIds).toContain(1);

    // After stop, advancing the clock and firing any stale waker tick schedules nothing.
    for (let i = 0; i < 50; i++) h.pump(stepSec);
    h.pokeWaker();
    expect(h.clicks.length).toBe(countAtStop);
  });
});
