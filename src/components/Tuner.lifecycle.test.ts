/**
 * Tuner lifecycle / teardown tests (jsdom) — regression cover for the two
 * lifecycle defects found in code review:
 *   - Finding 1: switching away from the tuner tab must stop the mic.
 *   - Finding 2: a Start→Stop race must not leave a zombie mic / leaked pipeline.
 *
 * The mic + pipeline modules are mocked so the async acquire is controllable and
 * teardown side-effects (track.stop / ctx.close / pipeline.stop) are observable.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

const shared = vi.hoisted(() => ({
  pipelines: [] as Array<{ start: () => void; stop: () => void }>,
  handles: [] as Array<{
    ctx: { close: () => void };
    resolveReady: () => void;
    trackStop: () => void;
  }>,
}));

vi.mock('../lib/audio/pipeline', () => ({
  makeAnalyser: () => ({ fftSize: 4096 }),
  // A real class so `new PitchPipeline(...)` constructs correctly (an arrow fn
  // cannot be used with `new`). Each instance registers itself for assertions.
  PitchPipeline: class {
    start = vi.fn();
    stop = vi.fn();
    constructor() {
      shared.pipelines.push(this);
    }
  },
}));

vi.mock('../lib/audio/mic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/audio/mic')>();
  return {
    ...actual,
    micAvailable: () => true,
    acquireAudio: vi.fn(() => {
      const trackStop = vi.fn();
      const stream = { getTracks: () => [{ stop: trackStop, kind: 'audio' }] };
      const ctx = {
        createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
        sampleRate: 44100,
        close: vi.fn(),
        state: 'running',
        resume: vi.fn(),
      };
      let resolveReady!: () => void;
      const ready = new Promise((res) => {
        resolveReady = () => res({ ctx, stream });
      });
      shared.handles.push({ ctx, resolveReady, trackStop });
      return { ctx, ready };
    }),
  };
});

import Tuner from './Tuner.svelte';
import { TUNINGS } from '../lib/tuning/tunings';

beforeEach(() => {
  shared.pipelines.length = 0;
  shared.handles.length = 0;
});
afterEach(() => cleanup());

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await tick();
}

describe('Tuner lifecycle teardown', () => {
  it('stops the mic + pipeline when the user switches away from the tuner tab (Finding 1)', async () => {
    const { container, rerender } = render(Tuner, {
      props: { tuning: TUNINGS.standard, active: true },
    });
    const startBtn = container.querySelector('.start-btn') as HTMLButtonElement;

    await fireEvent.click(startBtn); // start(): acquire, running=true
    expect(shared.handles).toHaveLength(1);

    shared.handles[0].resolveReady();
    await flush();
    expect(shared.pipelines).toHaveLength(1);
    expect(shared.pipelines[0].start).toHaveBeenCalled();

    // Navigate away — panel is only hidden, so the $effect must release the mic.
    await rerender({ tuning: TUNINGS.standard, active: false });
    await flush();

    expect(shared.pipelines[0].stop).toHaveBeenCalled();
    expect(shared.handles[0].trackStop).toHaveBeenCalled();
    expect(shared.handles[0].ctx.close).toHaveBeenCalled();
  });

  it('does not wire up a zombie mic when Stop is pressed before the stream resolves (Finding 2)', async () => {
    const { container } = render(Tuner, {
      props: { tuning: TUNINGS.standard, active: true },
    });
    const btn = container.querySelector('.start-btn') as HTMLButtonElement;

    await fireEvent.click(btn); // start(): acquire pending, running=true
    expect(shared.handles).toHaveLength(1);

    await fireEvent.click(btn); // stop() while getUserMedia still pending

    // The stale acquire now resolves — it must self-release, not build a pipeline.
    shared.handles[0].resolveReady();
    await flush();

    expect(shared.pipelines).toHaveLength(0); // no pipeline ever wired up
    expect(shared.handles[0].trackStop).toHaveBeenCalled(); // stream released
    expect(shared.handles[0].ctx.close).toHaveBeenCalled(); // context closed
  });
});
