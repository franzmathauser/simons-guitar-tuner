import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeAnalyser, PitchPipeline, type PitchFrame } from './pipeline';

/**
 * jsdom has no Web Audio API (no AudioContext / AnalyserNode), so we drive the
 * pipeline with a fake analyser whose `getFloatTimeDomainData` fills the buffer,
 * and we stub requestAnimationFrame/cancelAnimationFrame to step frames
 * deterministically. pitchy itself is pure JS and runs fine here, so
 * `findPitch` is exercised for real (not stubbed).
 */

const SAMPLE_RATE = 44100;
const FFT_SIZE = 4096;

/** Fake analyser that fills the buffer via the provided writer. */
function fakeAnalyser(fill: (buf: Float32Array) => void, fftSize = FFT_SIZE): AnalyserNode {
  return {
    fftSize,
    getFloatTimeDomainData: (buf: Float32Array) => fill(buf),
  } as unknown as AnalyserNode;
}

/** Fill a buffer with a pure sine at `freq` Hz. */
function fillSine(freq: number) {
  return (buf: Float32Array): void => {
    for (let i = 0; i < buf.length; i++) {
      buf[i] = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('makeAnalyser', () => {
  it('creates an analyser with fftSize=4096 and connects the source into it', () => {
    const analyser = { fftSize: 0 } as AnalyserNode;
    const createAnalyser = vi.fn(() => analyser);
    const ctx = { createAnalyser } as unknown as AudioContext;
    const connect = vi.fn();
    const src = { connect } as unknown as AudioNode;

    const result = makeAnalyser(ctx, src);

    expect(result).toBe(analyser);
    expect(analyser.fftSize).toBe(4096);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(analyser);
  });
});

describe('PitchPipeline', () => {
  /** Install rAF/cAF stubs that record scheduled callbacks and ids. */
  function stubRaf() {
    const callbacks: FrameRequestCallback[] = [];
    let nextId = 1;
    const cancelled: number[] = [];
    const raf = vi.fn((cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return nextId++;
    });
    const caf = vi.fn((id: number) => {
      cancelled.push(id);
    });
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', caf);
    return { callbacks, raf, caf, cancelled };
  }

  it('start() drives a rAF loop that forwards {hz, clarity}; stop() cancels it', () => {
    const { callbacks, raf, caf, cancelled } = stubRaf();
    const frames: PitchFrame[] = [];
    const pipe = new PitchPipeline(fakeAnalyser(fillSine(440)), SAMPLE_RATE, (f) => frames.push(f));

    pipe.start();
    expect(raf).toHaveBeenCalledTimes(1); // loop scheduled once

    // Step exactly one frame.
    callbacks[0](performance.now());

    expect(frames).toHaveLength(1);
    expect(typeof frames[0].hz).toBe('number');
    expect(typeof frames[0].clarity).toBe('number');
    // Real pitchy on a clean 440 Hz sine: ~440 Hz, clarity ~1.
    expect(frames[0].hz).toBeGreaterThan(435);
    expect(frames[0].hz).toBeLessThan(445);
    expect(frames[0].clarity).toBeGreaterThan(0.9);

    // The loop re-scheduled itself.
    expect(raf).toHaveBeenCalledTimes(2);

    pipe.stop();
    expect(caf).toHaveBeenCalledTimes(1);
    expect(cancelled[0]).toBe(2); // cancels the most recently scheduled id
  });

  it('passes pitchy [0,0] through unchanged on silence', () => {
    const { callbacks } = stubRaf();
    const frames: PitchFrame[] = [];
    // Buffer stays all zeros -> pitchy returns [0, 0].
    const pipe = new PitchPipeline(fakeAnalyser(() => {}), SAMPLE_RATE, (f) => frames.push(f));

    pipe.start();
    callbacks[0](0);

    expect(frames[0]).toEqual({ hz: 0, clarity: 0 });
  });

  it('start() is idempotent while running (no duplicate loops)', () => {
    const { raf } = stubRaf();
    const pipe = new PitchPipeline(fakeAnalyser(fillSine(440)), SAMPLE_RATE, () => {});

    pipe.start();
    pipe.start();

    expect(raf).toHaveBeenCalledTimes(1);
  });

  it('stop() before start() is a safe no-op', () => {
    const { caf } = stubRaf();
    const pipe = new PitchPipeline(fakeAnalyser(fillSine(440)), SAMPLE_RATE, () => {});

    expect(() => pipe.stop()).not.toThrow();
    expect(caf).not.toHaveBeenCalled();
  });
});
