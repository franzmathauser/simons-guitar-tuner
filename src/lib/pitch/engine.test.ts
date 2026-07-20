import { describe, it, expect } from 'vitest';
import { TunerEngine } from './engine';
import { TUNINGS } from '../tuning/tunings';

const STD = TUNINGS.standard;

const HIGH = 0.99; // above the 0.9 clarity threshold
const LOW = 0.5; // below the threshold

describe('TunerEngine (architecture §4.8)', () => {
  describe('initial / frozen state (§4.8 initial-reading)', () => {
    it('AC-6(b): a first-ever low-clarity frame returns the defined initial frozen reading (no throw)', () => {
      const eng = new TunerEngine(STD);
      const r = eng.update({ hz: 82.41, clarity: LOW });
      expect(r.hasSignal).toBe(false);
      expect(r.stringIndex).toBe(0);
      expect(r.note).toBe(STD.strings[0]);
      expect(r.cents).toBe(0);
      expect(r.displayCents).toBe(0);
      expect(r.state).toBe('ok');
      expect(r.measuredHz).toBe(0);
    });

    it("treats pitchy's [0,0] (hz=0, clarity=0) as no-signal", () => {
      const eng = new TunerEngine(STD);
      const r = eng.update({ hz: 0, clarity: 0 });
      expect(r.hasSignal).toBe(false);
      expect(r.measuredHz).toBe(0);
    });

    it('treats a non-finite hz as no-signal even with high clarity', () => {
      const eng = new TunerEngine(STD);
      expect(eng.update({ hz: Number.NaN, clarity: HIGH }).hasSignal).toBe(false);
      expect(eng.update({ hz: Number.POSITIVE_INFINITY, clarity: HIGH }).hasSignal).toBe(false);
    });
  });

  describe('valid-frame processing', () => {
    it('auto-selects the nearest string and reports its note', () => {
      const eng = new TunerEngine(STD);
      const r = eng.update({ hz: 196.0, clarity: HIGH }); // G3
      expect(r.hasSignal).toBe(true);
      expect(r.stringIndex).toBe(3);
      expect(r.note.note).toBe('G');
      expect(r.note.octave).toBe(3);
      expect(Math.abs(r.cents)).toBeLessThan(1);
      expect(r.state).toBe('ok');
    });

    it('displayCents is the rounded cents value', () => {
      const eng = new TunerEngine(STD);
      const r = eng.update({ hz: 84, clarity: HIGH }); // ~33.1¢ sharp of E2
      expect(r.stringIndex).toBe(0);
      expect(r.displayCents).toBe(Math.round(r.cents));
      expect(r.displayCents).toBe(33);
    });

    it('§4.8.3: out-of-every-window first frame keeps the default string index 0', () => {
      const eng = new TunerEngine(STD);
      const r = eng.update({ hz: 500, clarity: HIGH });
      expect(r.hasSignal).toBe(true);
      expect(r.stringIndex).toBe(0); // selectTarget -> null, keep previous (default 0)
    });

    it('keeps the previous string index when a later frame is out of window', () => {
      const eng = new TunerEngine(STD);
      eng.update({ hz: 196.0, clarity: HIGH }); // locks onto index 3
      const r = eng.update({ hz: 500, clarity: HIGH }); // out of window
      expect(r.stringIndex).toBe(3);
    });

    it('median-smooths measuredHz, rejecting a single outlier', () => {
      const eng = new TunerEngine(STD);
      eng.setManualOverride(1); // keep string stable while we probe the median
      let r = eng.update({ hz: 110, clarity: HIGH });
      r = eng.update({ hz: 110, clarity: HIGH });
      r = eng.update({ hz: 300, clarity: HIGH }); // glitch
      r = eng.update({ hz: 110, clarity: HIGH });
      r = eng.update({ hz: 110, clarity: HIGH });
      expect(r.measuredHz).toBe(110); // median of [110,110,300,110,110]
    });
  });

  describe('AC-4: manual override locks the string', () => {
    it('keeps stringIndex at the override even when a neighbour pitch is fed', () => {
      const eng = new TunerEngine(STD);
      eng.setManualOverride(2); // D3
      const r = eng.update({ hz: 110, clarity: HIGH }); // A2 = neighbour (idx 1)
      expect(r.stringIndex).toBe(2);
      expect(r.note.note).toBe('D');
      expect(r.note.octave).toBe(3);
      expect(eng.manualOverride).toBe(2);
    });

    it('clamps the override index into 0..5', () => {
      const eng = new TunerEngine(STD);
      eng.setManualOverride(99);
      expect(eng.manualOverride).toBe(5);
      eng.setManualOverride(-3);
      expect(eng.manualOverride).toBe(0);
    });

    it('setManualOverride(null) restores auto-selection', () => {
      const eng = new TunerEngine(STD);
      eng.setManualOverride(2);
      eng.setManualOverride(null);
      expect(eng.manualOverride).toBeNull();
      const r = eng.update({ hz: 196.0, clarity: HIGH }); // auto -> G3
      expect(r.stringIndex).toBe(3);
    });
  });

  describe('AC-6: clarity gate + freeze', () => {
    it('(a) freezes the last reading (cents/stringIndex/measuredHz) when clarity drops', () => {
      const eng = new TunerEngine(STD);
      const prev = eng.update({ hz: 84, clarity: HIGH }); // ~33¢ sharp of E2
      expect(prev.hasSignal).toBe(true);

      const frozen = eng.update({ hz: 84, clarity: LOW });
      expect(frozen.hasSignal).toBe(false);
      expect(frozen.cents).toBe(prev.cents);
      expect(frozen.displayCents).toBe(prev.displayCents);
      expect(frozen.stringIndex).toBe(prev.stringIndex);
      expect(frozen.measuredHz).toBe(prev.measuredHz);
      expect(frozen.state).toBe(prev.state);
      expect(frozen.note).toBe(prev.note);
    });

    it('drops stale median samples on freeze so resume is not polluted', () => {
      const eng = new TunerEngine(STD);
      eng.setManualOverride(1); // A2, keep string fixed
      eng.update({ hz: 300, clarity: HIGH }); // pollute the median window
      eng.update({ hz: 300, clarity: HIGH });
      eng.update({ hz: 84, clarity: LOW }); // freeze -> median.reset()
      const resumed = eng.update({ hz: 110, clarity: HIGH });
      // Median was cleared, so the first resumed sample is returned verbatim.
      expect(resumed.measuredHz).toBe(110);
    });
  });

  describe('setTuning', () => {
    it('swaps the tuning and reports notes from the new tuning', () => {
      const eng = new TunerEngine(STD);
      eng.setManualOverride(0);
      eng.setTuning(TUNINGS.dropd);
      const r = eng.update({ hz: 73.42, clarity: HIGH }); // Drop-D low string
      expect(r.note.note).toBe('D');
      expect(r.note.octave).toBe(2);
      expect(r.stringIndex).toBe(0);
    });
  });

  describe('reset', () => {
    it('re-establishes the defined initial reading', () => {
      const eng = new TunerEngine(STD);
      eng.update({ hz: 196.0, clarity: HIGH });
      eng.reset();
      const r = eng.update({ hz: 82.41, clarity: LOW }); // low clarity -> frozen initial
      expect(r.hasSignal).toBe(false);
      expect(r.stringIndex).toBe(0);
      expect(r.measuredHz).toBe(0);
      expect(r.cents).toBe(0);
      expect(r.state).toBe('ok');
    });
  });

  describe('options are honoured', () => {
    it('respects a custom clarityThreshold', () => {
      const eng = new TunerEngine(STD, { clarityThreshold: 0.4 });
      const r = eng.update({ hz: 82.41, clarity: 0.5 }); // above custom threshold
      expect(r.hasSignal).toBe(true);
    });
  });
});
