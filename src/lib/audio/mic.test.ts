import { describe, it, expect, vi } from 'vitest';
import {
  AUDIO_CONSTRAINTS,
  acquireAudio,
  micAvailable,
  MicUnavailableError,
  MicPermissionError,
} from './mic';

/** Minimal fake AudioContext exposing only the `resume` we exercise. */
function fakeCtx(resume: () => Promise<void> = () => Promise.resolve()): AudioContext {
  return { resume: vi.fn(resume) } as unknown as AudioContext;
}

describe('AUDIO_CONSTRAINTS (AC-14)', () => {
  it('turns all browser DSP off', () => {
    expect(AUDIO_CONSTRAINTS.echoCancellation).toBe(false);
    expect(AUDIO_CONSTRAINTS.noiseSuppression).toBe(false);
    expect(AUDIO_CONSTRAINTS.autoGainControl).toBe(false);
  });
});

describe('micAvailable (AC-8)', () => {
  it('is false when navigator.mediaDevices is undefined', () => {
    expect(micAvailable({ mediaDevices: undefined } as unknown as Navigator)).toBe(false);
  });

  it('is false when the passed navigator has no mediaDevices property at all', () => {
    expect(micAvailable({} as Navigator)).toBe(false);
  });

  it('is false when the argument itself is undefined', () => {
    expect(micAvailable(undefined)).toBe(false);
  });

  it('is true when mediaDevices.getUserMedia is a function', () => {
    const nav = {
      mediaDevices: { getUserMedia: () => Promise.resolve({} as MediaStream) },
    } as unknown as Navigator;
    expect(micAvailable(nav)).toBe(true);
  });
});

describe('acquireAudio', () => {
  it('AC-14: calls the injected getUserMedia with {audio: all-flags-false}', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({} as MediaStream);
    const { ready } = acquireAudio({ makeContext: () => fakeCtx(), getUserMedia });
    await ready;

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    const passed = getUserMedia.mock.calls[0][0] as MediaStreamConstraints;
    const audio = passed.audio as MediaTrackConstraints;
    expect(audio.echoCancellation).toBe(false);
    expect(audio.noiseSuppression).toBe(false);
    expect(audio.autoGainControl).toBe(false);
    // It forwards the mandated constraints object verbatim.
    expect(passed.audio).toBe(AUDIO_CONSTRAINTS);
  });

  it('AC-9 (critical): calls ctx.resume() SYNCHRONOUSLY, before getUserMedia settles', async () => {
    const order: string[] = [];
    const resume = vi.fn(() => {
      order.push('resume');
      return Promise.resolve();
    });
    const ctx = { resume } as unknown as AudioContext;

    // getUserMedia stays pending: we never resolve it until we choose to.
    let resolveStream!: (s: MediaStream) => void;
    const getUserMedia = vi.fn(() => {
      order.push('getUserMedia-called');
      return new Promise<MediaStream>((res) => {
        resolveStream = res;
      });
    });

    const handle = acquireAudio({ makeContext: () => ctx, getUserMedia });

    // --- Synchronous ordering proof (no await has run yet) ---
    // resume was invoked during the acquireAudio() call itself...
    expect(resume).toHaveBeenCalledTimes(1);
    // ...strictly before getUserMedia, and getUserMedia is still pending.
    expect(order).toEqual(['resume', 'getUserMedia-called']);

    // `ready` cannot have resolved: its stream promise is still pending.
    let readyResolved = false;
    void handle.ready.then(() => {
      readyResolved = true;
    });
    // Flush any already-queued microtasks; resume already happened above.
    await Promise.resolve();
    await Promise.resolve();
    expect(readyResolved).toBe(false);
    expect(resume).toHaveBeenCalledTimes(1); // still just the one synchronous call

    // Now settle the stream and confirm the resolved shape.
    const stream = {} as MediaStream;
    resolveStream(stream);
    const result = await handle.ready;
    expect(result.ctx).toBe(ctx);
    expect(result.stream).toBe(stream);
    expect(readyResolved).toBe(true);
  });

  it('AC-8: a rejected getUserMedia (NotAllowedError) => ready rejects with MicPermissionError', async () => {
    const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    const getUserMedia = vi.fn().mockRejectedValue(denied);
    const { ready } = acquireAudio({ makeContext: () => fakeCtx(), getUserMedia });

    await expect(ready).rejects.toBeInstanceOf(MicPermissionError);
    // Original DOMException is preserved as the cause for diagnostics.
    await ready.catch((e: MicPermissionError) => {
      expect(e.cause).toBe(denied);
    });
  });

  it('AC-8: no getUserMedia on the platform => ready rejects with MicUnavailableError (no throw-to-top)', async () => {
    // Deterministically remove the platform mic API for the duration of the test.
    const nav = globalThis.navigator as unknown as { mediaDevices?: unknown };
    const had = Object.prototype.hasOwnProperty.call(nav, 'mediaDevices');
    const original = Object.getOwnPropertyDescriptor(nav, 'mediaDevices');
    Object.defineProperty(nav, 'mediaDevices', { value: undefined, configurable: true });
    try {
      // No getUserMedia dep => falls back to the (now absent) platform API.
      // acquireAudio itself must NOT throw synchronously.
      const handle = acquireAudio({ makeContext: () => fakeCtx() });
      await expect(handle.ready).rejects.toBeInstanceOf(MicUnavailableError);
    } finally {
      if (had && original) {
        Object.defineProperty(nav, 'mediaDevices', original);
      } else {
        delete nav.mediaDevices;
      }
    }
  });

  it('AC-8: non-permission getUserMedia failures bubble up unchanged', async () => {
    const notFound = Object.assign(new Error('No device'), { name: 'NotFoundError' });
    const getUserMedia = vi.fn().mockRejectedValue(notFound);
    const { ready } = acquireAudio({ makeContext: () => fakeCtx(), getUserMedia });

    await expect(ready).rejects.toBe(notFound);
  });
});
