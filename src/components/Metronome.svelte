<script lang="ts">
  /**
   * Metronome panel (architecture §5, AC-10 / AC-13). BPM readout, four beat dots
   * (the downbeat carries the distinct `.beat--down` class), −/+ buttons + range,
   * and a Start/Stop control.
   *
   * Beat INSTANTS come only from `MetronomeScheduler` on the audio clock
   * (`AudioContext.currentTime`); the Web Worker (or a setTimeout fallback) is a
   * WAKER only — it re-invokes the scheduling scan, it is never the beat time
   * source (§0 NEVER rule). The dot is lit at the beat's audio time via a rAF
   * draw loop draining a small queue, so the visual matches the sounded click.
   */
  import { onDestroy } from 'svelte';
  import { clampBpm, MetronomeScheduler } from '../lib/metronome/scheduler';
  import type { SchedulerDeps } from '../lib/metronome/scheduler';

  let { active = true }: { active?: boolean } = $props();

  let bpm = $state(120);
  let running = $state(false);
  let activeBeat = $state(-1);
  const beats = [0, 1, 2, 3];

  let ac: AudioContext | null = null;
  let scheduler: MetronomeScheduler | null = null;
  let rafId: number | null = null;
  let uiQueue: { beat: number; time: number }[] = [];

  interface Waker {
    worker?: Worker;
    intervalId?: ReturnType<typeof setInterval>;
  }
  const wakers = new Map<number, Waker>();
  let wakerSeq = 0;

  function setBpm(v: number): void {
    bpm = clampBpm(v);
    scheduler?.setBpm(bpm);
  }

  function onRange(e: Event): void {
    setBpm(+(e.currentTarget as HTMLInputElement).value);
  }

  /** Oscillator "click" envelope, ported from the mockup (accent = 1500 Hz else 900 Hz). */
  function clickSound(time: number, accent: boolean): void {
    if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = accent ? 1500 : 900;
    o.connect(g);
    g.connect(ac.destination);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.32, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    o.start(time);
    o.stop(time + 0.06);
  }

  /** Waker: prefer the Web Worker, fall back to setTimeout-based interval. */
  function startWaker(cb: () => void, ms: number): number {
    const id = ++wakerSeq;
    try {
      const worker = new Worker(new URL('../lib/metronome/worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (e: MessageEvent) => {
        if (e.data?.type === 'tick') cb();
      };
      worker.postMessage({ type: 'start', ms });
      wakers.set(id, { worker });
    } catch {
      // Fallback is still ONLY a waker (re-invokes the scan), never the beat time source.
      const intervalId = setInterval(cb, ms);
      wakers.set(id, { intervalId });
    }
    return id;
  }

  function stopWaker(id: number): void {
    const w = wakers.get(id);
    if (!w) return;
    if (w.worker) {
      w.worker.postMessage({ type: 'stop' });
      w.worker.terminate();
    }
    if (w.intervalId != null) clearInterval(w.intervalId);
    wakers.delete(id);
  }

  /** Light the dot at the beat's audio time (decouples display from lookahead scheduling). */
  function draw(): void {
    if (!running || !ac) return;
    const t = ac.currentTime;
    while (uiQueue.length && uiQueue[0].time <= t) {
      activeBeat = uiQueue.shift()!.beat;
    }
    rafId = requestAnimationFrame(draw);
  }

  function start(): void {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ac = ac ?? new Ctor();
    // Unlock on the user gesture (must be synchronous within the click handler).
    if (ac.state === 'suspended') void ac.resume();

    const deps: SchedulerDeps = {
      now: () => ac!.currentTime,
      scheduleClick: (time, accent) => clickSound(time, accent),
      setWaker: (cb, ms) => startWaker(cb, ms),
      clearWaker: (id) => stopWaker(id),
    };
    uiQueue = [];
    scheduler = new MetronomeScheduler(deps);
    scheduler.setBpm(bpm);
    scheduler.onBeat((beat, time) => uiQueue.push({ beat, time }));
    running = true;
    scheduler.start(ac.currentTime + 0.06);
    rafId = requestAnimationFrame(draw);
  }

  function stop(): void {
    scheduler?.stop(); // clears the waker via SchedulerDeps.clearWaker
    scheduler = null;
    running = false;
    activeBeat = -1;
    uiQueue = [];
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function toggle(): void {
    if (running) stop();
    else start();
  }

  // Stop cleanly when the tab is backgrounded (D-21).
  $effect(() => {
    function onVisibility(): void {
      if (document.hidden && running) stop();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  });

  onDestroy(() => {
    stop();
    void ac?.close();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<section class="panel" hidden={!active} role="tabpanel" aria-label="Metronom">
  <div class="metro">
    <div class="bpm">
      <span class="bpm__num">{bpm}</span><span class="bpm__unit">BPM · 4/4</span>
    </div>
    <div class="beats" aria-hidden="true">
      {#each beats as i (i)}
        <div class={['beat', i === 0 && 'beat--down', activeBeat === i && 'is-hit']}></div>
      {/each}
    </div>
    <div class="bpm-ctrl">
      <button class="round-btn" type="button" aria-label="Langsamer" onclick={() => setBpm(bpm - 1)}
        >–</button
      >
      <input
        type="range"
        min="40"
        max="240"
        value={bpm}
        aria-label="Tempo in BPM"
        oninput={onRange}
      />
      <button class="round-btn" type="button" aria-label="Schneller" onclick={() => setBpm(bpm + 1)}
        >+</button
      >
    </div>
    <button
      class="start-btn"
      class:is-running={running}
      type="button"
      aria-pressed={running}
      onclick={toggle}
    >
      <svg width="14" height="14" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"
        ><path d="M2 1l8 5-8 5z" /></svg
      >
      <span>{running ? 'Stop' : 'Start'}</span>
    </button>
  </div>
</section>
