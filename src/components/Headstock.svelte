<script lang="ts">
  /**
   * Headstock with 3+3 tuning pegs (architecture §5). Ported 1:1 from the mockup
   * `buildHeadstock()`. Tapping (or Enter/Space on) a peg fires `onselect(idx)`,
   * which the parent Tuner wires to `engine.setManualOverride` (manual override,
   * AC-4 / D-3). The selected peg is lit via `.is-sel` (teal).
   */
  import type { Tuning } from '../lib/tuning/types';

  interface Props {
    tuning: Tuning;
    selectedIndex: number;
    onselect?: (idx: number) => void;
  }
  let { tuning, selectedIndex, onselect }: Props = $props();

  interface PegLayout {
    idx: number;
    side: 'L' | 'R';
    row: number;
  }
  // left side gets low strings 0,1,2 ; right side gets 5,4,3 (high->low top to bottom)
  const LAYOUT: PegLayout[] = [
    { idx: 0, side: 'L', row: 0 },
    { idx: 1, side: 'L', row: 1 },
    { idx: 2, side: 'L', row: 2 },
    { idx: 5, side: 'R', row: 0 },
    { idx: 4, side: 'R', row: 1 },
    { idx: 3, side: 'R', row: 2 },
  ];
  const rowY = [62, 116, 170];

  interface Peg {
    idx: number;
    postX: number;
    postY: number;
    neckX: number;
    neckY: number;
    bodyX: number;
    bodyY: number;
    labelX: number;
    labelY: number;
    label: string;
  }
  const pegs = $derived(
    LAYOUT.map((l): Peg => {
      const y = rowY[l.row];
      const isL = l.side === 'L';
      const btnX = isL ? 72 : 188; // knob center — straddles the headstock edge
      const postX = isL ? 112 : 148; // string post (winder) on the wood face
      const s = tuning.strings[l.idx];
      return {
        idx: l.idx,
        postX,
        postY: y,
        neckX: isL ? 92 : 146,
        neckY: y - 4,
        bodyX: btnX - 24,
        bodyY: y - 15,
        labelX: btnX,
        labelY: y + 1,
        label: s.note + (s.accidental || ''),
      };
    })
  );

  function select(idx: number): void {
    onselect?.(idx);
  }
  function onKey(e: KeyboardEvent, idx: number): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(idx);
    }
  }
</script>

<div class="headstock">
  <svg
    class="headstock__svg"
    viewBox="0 0 260 210"
    role="group"
    aria-label="Gitarrenkopf mit Mechaniken"
  >
    <path class="hs-body" d="M88 186 L88 50 Q88 20 130 16 Q172 20 172 50 L172 186 Z" />
    <rect class="hs-nut" x="86" y="184" width="88" height="9" rx="3" />
    {#each pegs as p (p.idx)}
      <line class="hs-string" x1={p.postX} y1={p.postY} x2="130" y2="184" />
      <g
        class="peg-btn"
        class:is-sel={p.idx === selectedIndex}
        tabindex="0"
        role="button"
        aria-label={`Saite ${p.label} manuell wählen`}
        aria-pressed={p.idx === selectedIndex}
        onclick={() => select(p.idx)}
        onkeydown={(e) => onKey(e, p.idx)}
      >
        <rect class="peg-neck" x={p.neckX} y={p.neckY} width="22" height="8" rx="3" />
        <circle class="peg-post" cx={p.postX} cy={p.postY} r="6" />
        <rect class="peg-body" x={p.bodyX} y={p.bodyY} width="48" height="30" rx="11" />
        <text class="peg-label" x={p.labelX} y={p.labelY}>{p.label}</text>
      </g>
    {/each}
  </svg>
  <div class="headstock__hint">Mechanik antippen = Saite manuell wählen</div>
</div>
