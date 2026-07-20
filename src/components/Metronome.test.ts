/**
 * Metronome component tests (AC-13) — jsdom, DOM-structural only.
 *
 * jsdom has no CSS cascade/layout, so we assert structure, not computed colour:
 *  - exactly 4 `.beat` dots render; the first carries `.beat--down`, the rest do not;
 *  - the BPM controls clamp to [40, 240] at the UI.
 * No audio is started (Start is never clicked), so no AudioContext/Worker is created.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Metronome from './Metronome.svelte';

afterEach(cleanup);

describe('Metronome beat dots (AC-13)', () => {
  it('renders exactly 4 beat dots and only the first is the downbeat', () => {
    const { container } = render(Metronome, { props: { active: true } });

    const beats = container.querySelectorAll('.beat');
    expect(beats.length).toBe(4);

    // The downbeat carries the distinct `.beat--down` class...
    expect(beats[0].classList.contains('beat--down')).toBe(true);
    // ...and the other three do NOT.
    expect(beats[1].classList.contains('beat--down')).toBe(false);
    expect(beats[2].classList.contains('beat--down')).toBe(false);
    expect(beats[3].classList.contains('beat--down')).toBe(false);
  });
});

describe('Metronome BPM clamp (AC-13)', () => {
  it('holds at the lower bound of 40 when decrementing', async () => {
    const { container } = render(Metronome, { props: { active: true } });
    const range = container.querySelector('input[type=range]') as HTMLInputElement;
    const down = container.querySelector('button[aria-label="Langsamer"]') as HTMLButtonElement;
    const num = container.querySelector('.bpm__num') as HTMLElement;

    expect(range.min).toBe('40');
    await fireEvent.input(range, { target: { value: '40' } });
    expect(num.textContent).toBe('40');

    await fireEvent.click(down); // 40 - 1 => clampBpm(39) === 40
    expect(num.textContent).toBe('40');
  });

  it('holds at the upper bound of 240 when incrementing', async () => {
    const { container } = render(Metronome, { props: { active: true } });
    const range = container.querySelector('input[type=range]') as HTMLInputElement;
    const up = container.querySelector('button[aria-label="Schneller"]') as HTMLButtonElement;
    const num = container.querySelector('.bpm__num') as HTMLElement;

    expect(range.max).toBe('240');
    await fireEvent.input(range, { target: { value: '240' } });
    expect(num.textContent).toBe('240');

    await fireEvent.click(up); // 240 + 1 => clampBpm(241) === 240
    expect(num.textContent).toBe('240');
  });
});
