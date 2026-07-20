import { describe, it, expect } from 'vitest';
import { centsToState, IN_TUNE_CENTS } from './state';

describe('centsToState (architecture §4.5, AC-2)', () => {
  it('treats the boundary band {-5, 0, +5} as "ok"', () => {
    expect(centsToState(-5)).toBe('ok');
    expect(centsToState(0)).toBe('ok');
    expect(centsToState(5)).toBe('ok');
  });

  it('classifies just outside the band by sign (not "ok")', () => {
    expect(centsToState(-6)).toBe('low');
    expect(centsToState(6)).toBe('high');
    expect(centsToState(-6)).not.toBe('ok');
    expect(centsToState(6)).not.toBe('ok');
  });

  it('classifies clearly flat as "low" and clearly sharp as "high"', () => {
    expect(centsToState(-50)).toBe('low');
    expect(centsToState(50)).toBe('high');
  });

  it('exposes the shared in-tune constant of 5 cents', () => {
    expect(IN_TUNE_CENTS).toBe(5);
  });

  it('honours a custom in-tune band when provided (anti-drift coupling)', () => {
    expect(centsToState(8, 10)).toBe('ok');
    expect(centsToState(11, 10)).toBe('high');
  });
});
