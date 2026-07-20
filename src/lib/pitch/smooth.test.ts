import { describe, it, expect } from 'vitest';
import type { TuneState } from './state';
import { centsToState } from './state';
import { MedianSmoother, HysteresisState } from './smooth';

/** Count state transitions in a sequence of verdicts. */
function transitions(states: TuneState[]): number {
  let n = 0;
  for (let i = 1; i < states.length; i++) {
    if (states[i] !== states[i - 1]) n++;
  }
  return n;
}

describe('MedianSmoother (architecture §4.7, AC-5)', () => {
  it('returns the middle value for a full odd window (size 5)', () => {
    const m = new MedianSmoother(5);
    let out = 0;
    for (const v of [10, 12, 11, 13, 9]) out = m.push(v);
    expect(out).toBe(11); // sorted [9,10,11,12,13] -> 11
  });

  it('averages the two central values for a full even window (size 4)', () => {
    const m = new MedianSmoother(4);
    let out = 0;
    for (const v of [1, 2, 3, 4]) out = m.push(v);
    expect(out).toBe(2.5); // sorted [1,2,3,4] -> (2+3)/2
  });

  it('slides the window, dropping the oldest sample', () => {
    const m = new MedianSmoother(3);
    m.push(100);
    m.push(101);
    m.push(102); // window [100,101,102] -> 101
    const out = m.push(200); // window [101,102,200] -> 102
    expect(out).toBe(102);
  });

  it('is independent of push order for the same multiset', () => {
    const a = new MedianSmoother(5);
    const b = new MedianSmoother(5);
    let oa = 0;
    let ob = 0;
    for (const v of [5, 1, 4, 2, 3]) oa = a.push(v);
    for (const v of [3, 2, 4, 1, 5]) ob = b.push(v);
    expect(oa).toBe(ob);
    expect(oa).toBe(3);
  });

  it('reset() clears history so the next push is returned verbatim', () => {
    const m = new MedianSmoother(5);
    for (const v of [10, 20, 30, 40, 50]) m.push(v);
    m.reset();
    expect(m.push(7)).toBe(7);
  });
});

describe('HysteresisState (architecture §4.7, AC-5)', () => {
  it('DoD: oscillation around +5 from "ok" produces <= 2 transitions', () => {
    const h = new HysteresisState(); // inTune 5, margin 3 -> leave at >8
    const seq = [0, 4, 6, 4, 6, 4, 6];
    const hyst = seq.map((c) => h.update(c));
    const raw = seq.map((c) => centsToState(c));

    // The band is real, not tautological: raw would toggle repeatedly...
    expect(transitions(raw)).toBeGreaterThan(2);
    // ...but the hysteresis state stays settled.
    expect(transitions(hyst)).toBeLessThanOrEqual(2);
    expect(h.state).toBe('ok');
  });

  it('DoD: opposite-sign SNAP — start low (-12) then +12 becomes high', () => {
    const h = new HysteresisState();
    expect(h.update(-12)).toBe('low');
    expect(h.update(12)).toBe('high'); // never stuck showing "low" while sharp
    expect(h.state).toBe('high');
  });

  it('DoD: enter-ok from high — +12 then +4 becomes ok', () => {
    const h = new HysteresisState();
    expect(h.update(12)).toBe('high');
    expect(h.update(4)).toBe('ok'); // enters ok as soon as |cents| <= inTune
  });

  it('is sticky in the 5..8 anti-flicker band (holds "ok" at +6, +7)', () => {
    const h = new HysteresisState();
    expect(h.update(0)).toBe('ok');
    expect(h.update(6)).toBe('ok');
    expect(h.update(7)).toBe('ok');
    // Only past inTune+margin (=8) does it leave.
    expect(h.update(9)).toBe('high');
  });

  it('starts in "ok" and reset() returns to "ok"', () => {
    const h = new HysteresisState();
    expect(h.state).toBe('ok');
    h.update(50);
    expect(h.state).toBe('high');
    h.reset();
    expect(h.state).toBe('ok');
  });

  it('enters low from ok when clearly flat past the leave threshold', () => {
    const h = new HysteresisState();
    expect(h.update(-20)).toBe('low');
  });
});
