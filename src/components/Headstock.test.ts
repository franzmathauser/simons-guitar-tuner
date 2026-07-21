/**
 * Headstock component tests — string layout + manual-select mapping.
 *
 * Two guarantees the reference image demands (issue: "labels wrong, and the tone must
 * move accordingly — do not just switch the labels"):
 *
 *  1. The pegs read, top→bottom, D/A/E on the left column and G/B/E on the right column
 *     for standard tuning — matching the physical headstock in the reference image.
 *  2. The label at a position and the *string index* that position selects come from the
 *     SAME layout entry, so tapping a peg locks onto the string whose label is shown
 *     (the tone follows the label — it is not a cosmetic relabel).
 *
 * jsdom renders the SVG structurally; we assert peg order, labels, and the idx passed to
 * onselect — never computed layout/colour.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Headstock from './Headstock.svelte';
import { TUNINGS } from '../lib/tuning/tunings';

afterEach(cleanup);

const standard = TUNINGS.standard;

/** Peg <g> elements in DOM order == layout order (L top→bottom, then R top→bottom). */
function pegs(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll('.peg-btn')) as unknown as SVGGElement[];
}

describe('Headstock layout (reference image)', () => {
  it('shows D/A/E (left) then G/B/E (right), top→bottom, for standard tuning', () => {
    const { container } = render(Headstock, {
      props: { tuning: standard, selectedIndex: 0 },
    });
    const labels = pegs(container).map((g) => g.querySelector('.peg-label')?.textContent);
    expect(labels).toEqual(['D', 'A', 'E', 'G', 'B', 'E']);
  });

  it('maps each visible peg to the matching string index (tone follows the label)', async () => {
    const onselect = vi.fn();
    const { container } = render(Headstock, {
      props: { tuning: standard, selectedIndex: 0, onselect },
    });

    // Expected (label, string index) per position — the index is what drives the tone.
    const expected: Array<[string, number]> = [
      ['D', 2],
      ['A', 1],
      ['E', 0],
      ['G', 3],
      ['B', 4],
      ['E', 5],
    ];

    const g = pegs(container);
    for (let i = 0; i < expected.length; i++) {
      const [label, idx] = expected[i];
      expect(g[i].querySelector('.peg-label')?.textContent).toBe(label);
      onselect.mockClear();
      await fireEvent.click(g[i]);
      expect(onselect).toHaveBeenCalledWith(idx);
    }
  });

  it('lights the peg whose string index is selected (auto-detect highlight intact)', () => {
    // selectedIndex 5 is the high E on the bottom-right; it must carry .is-sel.
    const { container } = render(Headstock, {
      props: { tuning: standard, selectedIndex: 5 },
    });
    const sel = pegs(container).filter((g) => g.classList.contains('is-sel'));
    expect(sel.length).toBe(1);
    expect(sel[0].querySelector('.peg-label')?.textContent).toBe('E');
    // ...and it is the LAST peg in DOM order (bottom-right), not the top-right one.
    expect(sel[0]).toBe(pegs(container)[5]);
  });
});

describe('Headstock strings fan across the nut', () => {
  it('gives every string a distinct nut anchor (no single convergence point)', () => {
    const { container } = render(Headstock, {
      props: { tuning: standard, selectedIndex: 0 },
    });
    const xs = Array.from(container.querySelectorAll('.hs-string')).map((l) =>
      Number((l as SVGLineElement).getAttribute('x2'))
    );
    expect(xs.length).toBe(6);
    // All distinct — the old code converged every string on x2=130.
    expect(new Set(xs).size).toBe(6);
    expect(xs).not.toContain(130);
    // Ordered low-E (leftmost) → high-E (rightmost) by string index. Layout order is
    // idx [2,1,0,3,4,5]; sorting the anchors by idx must be strictly increasing in x.
    const byIdx = [2, 1, 0, 3, 4, 5].map((idx, pos) => ({ idx, x: xs[pos] }));
    byIdx.sort((a, b) => a.idx - b.idx);
    const sortedXs = byIdx.map((e) => e.x);
    for (let i = 1; i < sortedXs.length; i++) {
      expect(sortedXs[i]).toBeGreaterThan(sortedXs[i - 1]);
    }
  });
});
