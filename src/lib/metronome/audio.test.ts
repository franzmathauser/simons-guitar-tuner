/**
 * Keep-alive tests — the iOS "silent after the first click" fix.
 *
 * The keep-alive must (a) run a LOOPING, SILENT source that keeps the audio session live
 * for the whole run, and (b) tear that source down cleanly (idempotently) on stop. We pin
 * both with a fake context, since jsdom has no real Web Audio.
 */
import { describe, it, expect } from 'vitest';
import { startKeepAlive, type KeepAliveAudio } from './audio';

interface Fake {
  ac: KeepAliveAudio;
  source: {
    buffer: unknown;
    loop: boolean;
    started: number;
    stopped: number;
    connected: number;
    disconnected: number;
  };
  gain: { value: number; connected: number; disconnected: number };
  buffers: Array<[number, number, number]>;
  stopThrows: boolean;
}

function fakeAudio(sampleRate = 44100): Fake {
  const buffers: Array<[number, number, number]> = [];
  const state = { stopThrows: false };
  const source = {
    buffer: null as unknown,
    loop: false,
    started: 0,
    stopped: 0,
    connected: 0,
    disconnected: 0,
    start: () => void source.started++,
    stop: () => {
      if (state.stopThrows) throw new Error('already stopped');
      source.stopped++;
    },
    connect: () => void source.connected++,
    disconnect: () => void source.disconnected++,
  };
  const gain = {
    gain: { value: -1 },
    connected: 0,
    disconnected: 0,
    connect: () => void gain.connected++,
    disconnect: () => void gain.disconnected++,
  };
  const ac = {
    sampleRate,
    destination: {} as AudioNode,
    createBufferSource: () => source,
    createGain: () => gain,
    createBuffer: (ch: number, len: number, sr: number) => {
      buffers.push([ch, len, sr]);
      return {} as AudioBuffer;
    },
  } as unknown as KeepAliveAudio;

  return {
    ac,
    source,
    gain: { get value() { return gain.gain.value; }, get connected() { return gain.connected; }, get disconnected() { return gain.disconnected; } },
    buffers,
    get stopThrows() { return state.stopThrows; },
    set stopThrows(v: boolean) { state.stopThrows = v; },
  } as unknown as Fake;
}

describe('startKeepAlive', () => {
  it('starts a looping, zero-gain, single-sample silent source into the destination', () => {
    const f = fakeAudio(48000);
    startKeepAlive(f.ac);

    expect(f.buffers).toEqual([[1, 1, 48000]]); // one-sample buffer at the context rate
    expect(f.source.loop).toBe(true);
    expect(f.source.buffer).not.toBeNull();
    expect(f.gain.value).toBe(0); // truly silent
    expect(f.source.started).toBe(1);
    expect(f.source.connected).toBe(1); // source -> gain
    expect(f.gain.connected).toBe(1); //   gain  -> destination
  });

  it('stop() ends the source and disconnects both nodes', () => {
    const f = fakeAudio();
    const stop = startKeepAlive(f.ac);

    stop();
    expect(f.source.stopped).toBe(1);
    expect(f.source.disconnected).toBe(1);
    expect(f.gain.disconnected).toBe(1);
  });

  it('stop() is idempotent (a second call is a no-op)', () => {
    const f = fakeAudio();
    const stop = startKeepAlive(f.ac);

    stop();
    stop();
    expect(f.source.stopped).toBe(1);
    expect(f.source.disconnected).toBe(1);
  });

  it('stop() still disconnects when source.stop() throws (already stopped/closed)', () => {
    const f = fakeAudio();
    const stop = startKeepAlive(f.ac);
    f.stopThrows = true;

    expect(() => stop()).not.toThrow();
    expect(f.source.disconnected).toBe(1);
    expect(f.gain.disconnected).toBe(1);
  });
});
