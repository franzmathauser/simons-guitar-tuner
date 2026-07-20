/**
 * Tuner start-without-mic test (AC-8) — jsdom.
 *
 * With no `navigator.mediaDevices` (stubbed here, and the jsdom default),
 * `micAvailable()` is false: clicking Start must surface an actionable error
 * and must NOT throw or touch Web Audio. No pipeline/AudioContext is created.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Tuner from './Tuner.svelte';
import { TUNINGS } from '../lib/tuning/tunings';

let originalMediaDevices: PropertyDescriptor | undefined;

beforeEach(() => {
  const nav = navigator as unknown as object;
  originalMediaDevices = Object.getOwnPropertyDescriptor(nav, 'mediaDevices');
  Object.defineProperty(nav, 'mediaDevices', { value: undefined, configurable: true });
});

afterEach(() => {
  cleanup();
  const nav = navigator as unknown as { mediaDevices?: unknown };
  if (originalMediaDevices) {
    Object.defineProperty(nav, 'mediaDevices', originalMediaDevices);
  } else {
    delete nav.mediaDevices;
  }
});

describe('Tuner start without a microphone (AC-8)', () => {
  it('shows an actionable error and does not throw', async () => {
    const { container } = render(Tuner, { props: { tuning: TUNINGS.standard, active: true } });

    const start = container.querySelector('.start-btn') as HTMLButtonElement;
    expect(start).toBeTruthy();

    // Must not throw when there is no mic API.
    await fireEvent.click(start);

    const alert = container.querySelector('[role="alert"]') as HTMLElement | null;
    expect(alert).toBeTruthy();
    expect(alert?.textContent ?? '').toMatch(/Mikrofon/i);
  });
});
