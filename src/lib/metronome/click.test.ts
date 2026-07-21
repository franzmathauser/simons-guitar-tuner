/**
 * Click-synthesis tests — the iOS "silent after one click" regression guard.
 *
 * The bug: beat instants that slip behind the audio clock had their gain envelope written
 * in the past, so oscillators ran but rendered silently (the dots kept animating). The fix
 * is `playClick` clamping the envelope + start to `max(time, currentTime)`. These tests pin
 * that behaviour with a fake audio clock (jsdom has no real Web Audio).
 */
import { describe, it, expect } from 'vitest';
import {
  playClick,
  ACCENT_HZ,
  BEAT_HZ,
  ACCENT_GAIN,
  BEAT_GAIN,
  type ClickAudio,
} from './click';

interface Recorded {
  ac: ClickAudio;
  freq: () => number;
  gainSetAt: number[];
  ramps: Array<[value: number, time: number]>;
  startAt: number[];
  stopAt: number[];
  disconnects: string[];
  fireEnded: () => void;
}

/** A fake AudioContext that records the timestamps every scheduling call is given. */
function fakeAudio(currentTime: number): Recorded {
  const gainSetAt: number[] = [];
  const ramps: Array<[number, number]> = [];
  const startAt: number[] = [];
  const stopAt: number[] = [];
  const disconnects: string[] = [];
  let freq = 0;

  const gain = {
    gain: {
      setValueAtTime: (_v: number, t: number) => void gainSetAt.push(t),
      exponentialRampToValueAtTime: (v: number, t: number) => void ramps.push([v, t]),
    },
    connect: () => {},
    disconnect: () => void disconnects.push('gain'),
  };
  const osc = {
    frequency: { set value(v: number) { freq = v; }, get value() { return freq; } },
    connect: () => {},
    disconnect: () => void disconnects.push('osc'),
    onended: null as null | (() => void),
    start: (t: number) => void startAt.push(t),
    stop: (t: number) => void stopAt.push(t),
  };
  const ac = {
    currentTime,
    destination: {} as AudioNode,
    createOscillator: () => osc,
    createGain: () => gain,
  } as unknown as ClickAudio;

  return {
    ac,
    freq: () => freq,
    gainSetAt,
    ramps,
    startAt,
    stopAt,
    disconnects,
    fireEnded: () => osc.onended?.(),
  };
}

describe('playClick — envelope timing', () => {
  it('schedules a future beat exactly at its instant (no clamp needed)', () => {
    const r = fakeAudio(1.0);
    playClick(r.ac, 1.5, false); // 1.5 is ahead of currentTime 1.0

    expect(r.gainSetAt).toEqual([1.5]);
    expect(r.ramps.map(([, t]) => t)).toEqual([1.501, 1.55]);
    expect(r.startAt).toEqual([1.5]);
    expect(r.stopAt).toEqual([1.56]);
  });

  it('clamps a past beat up to currentTime so it stays audible (the iOS fix)', () => {
    const r = fakeAudio(2.0);
    playClick(r.ac, 1.5, false); // 1.5 is BEHIND currentTime 2.0 → must clamp to 2.0

    // Every timestamp anchors on 2.0, not the stale 1.5 — otherwise the attack/decay
    // envelope would already be over and the oscillator would render silently.
    expect(r.gainSetAt).toEqual([2.0]);
    expect(r.ramps.map(([, t]) => t)).toEqual([2.001, 2.05]);
    expect(r.startAt).toEqual([2.0]);
    expect(r.stopAt).toEqual([2.06]);
  });

  it('uses accent frequency + gain for the downbeat', () => {
    const r = fakeAudio(0);
    playClick(r.ac, 0.1, true);

    expect(r.freq()).toBe(ACCENT_HZ);
    expect(r.ramps[0][0]).toBe(ACCENT_GAIN);
  });

  it('uses the softer frequency + gain for off-beats', () => {
    const r = fakeAudio(0);
    playClick(r.ac, 0.1, false);

    expect(r.freq()).toBe(BEAT_HZ);
    expect(r.ramps[0][0]).toBe(BEAT_GAIN);
  });

  it('disconnects both nodes when the click ends (no node pile-up over a long run)', () => {
    const r = fakeAudio(0);
    playClick(r.ac, 0.1, false);

    expect(r.disconnects).toEqual([]); // still connected while sounding
    r.fireEnded(); // the browser fires `ended` after osc.stop()
    expect(r.disconnects).toEqual(['osc', 'gain']);
  });
});
