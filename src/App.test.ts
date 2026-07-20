/**
 * App theme-toggle test (AC-15) — jsdom, attribute-level only.
 *
 * jsdom has no CSS cascade, so we assert the `data-theme` attribute flips (the
 * mechanism the tokens key off), NOT computed token values or layout — those are
 * on the manual browser checklist per architecture §5.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import App from './App.svelte';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

describe('App theme toggle (AC-15)', () => {
  it('flips document.documentElement data-theme between light and dark', async () => {
    // Deterministic start, independent of OS preference / jsdom matchMedia.
    document.documentElement.setAttribute('data-theme', 'light');

    const { container } = render(App);
    const toggle = container.querySelector('.theme-btn') as HTMLButtonElement;
    expect(toggle).toBeTruthy();

    await fireEvent.click(toggle);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await fireEvent.click(toggle);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
