<script lang="ts">
  /**
   * Deviation gauge (architecture §5). Ported 1:1 from the mockup `buildGauge()`:
   * an arc, a green ±5¢ zone, ticks every 10¢, a pendulum needle and a hub.
   * The needle rotates to `cents` (clamped ±50 → ±SPAN); its colour follows
   * `state` via the `--state` CSS custom property. When `hasSignal` is false the
   * last needle transform is HELD (freeze — AC-6).
   */
  import type { TuneState } from '../lib/pitch/state';

  // NB: the prop is `state`, but a local binding named `state` would make the
  // compiler read `$state(...)` as a store subscription — so bind it as `tuneState`.
  let {
    cents,
    state: tuneState,
    hasSignal,
  }: { cents: number; state: TuneState; hasSignal: boolean } = $props();

  const CX = 150;
  const CY = 150;
  const R = 118;
  const SPAN = 52; // degrees each side

  function polar(deg: number, r: number): [number, number] {
    const a = ((deg - 90) * Math.PI) / 180;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  }

  // Static geometry (identical to the mockup).
  const [ax0, ay0] = polar(-SPAN, R);
  const [ax1, ay1] = polar(SPAN, R);
  const arcPath = `M${ax0} ${ay0} A${R} ${R} 0 0 1 ${ax1} ${ay1}`;

  const zDeg = SPAN * (6 / 50); // green in-tune zone (~±5¢ → ±6deg)
  const [zx0, zy0] = polar(-zDeg, R);
  const [zx1, zy1] = polar(zDeg, R);
  const zonePath = `M${zx0} ${zy0} A${R} ${R} 0 0 1 ${zx1} ${zy1}`;

  interface Tick {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    major: boolean;
  }
  const ticks: Tick[] = [];
  for (let c = -50; c <= 50; c += 10) {
    const deg = SPAN * (c / 50);
    const major = c % 50 === 0 || c === 0;
    const [x1, y1] = polar(deg, R - (major ? 14 : 8));
    const [x2, y2] = polar(deg, R + 2);
    ticks.push({ x1, y1, x2, y2, major });
  }

  const stateColor = $derived(
    tuneState === 'ok' ? 'var(--good)' : tuneState === 'low' ? 'var(--flat)' : 'var(--sharp)'
  );

  const liveDeg = $derived(SPAN * (Math.max(-50, Math.min(50, cents)) / 50));
  // Freeze (AC-6): hold the last live angle whenever there is no signal.
  let frozenDeg = $state(0);
  $effect(() => {
    if (hasSignal) frozenDeg = liveDeg;
  });
  const deg = $derived(hasSignal ? liveDeg : frozenDeg);
</script>

<div class="gauge">
  <svg
    class="gauge__svg"
    viewBox="0 0 300 172"
    role="img"
    aria-label="Abweichungs-Anzeige"
    style="--state:{stateColor}"
  >
    <path class="g-arc" d={arcPath} />
    <path class="g-zone" d={zonePath} />
    {#each ticks as t, i (i)}
      <line class={['g-tick', t.major && 'g-tick--major']} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
    {/each}
    <line
      class="g-needle"
      x1={CX}
      y1={CY}
      x2={CX}
      y2={CY - R + 4}
      style="transform-origin:{CX}px {CY}px; transform:rotate({deg}deg)"
    />
    <circle class="g-hub-ring" cx={CX} cy={CY} r="11" />
    <circle class="g-hub" cx={CX} cy={CY} r="6" />
  </svg>
  <div class="gauge__cap"><span>♭ zu tief</span><span>gestimmt</span><span>zu hoch ♯</span></div>
</div>
