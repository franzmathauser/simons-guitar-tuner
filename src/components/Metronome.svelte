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
  import { playClick } from '../lib/metronome/click';
  import { startKeepAlive } from '../lib/metronome/audio';

  let { active = true }: { active?: boolean } = $props();

  let bpm = $state(120);
  let running = $state(false);
  let activeBeat = $state(-1);
  const beats = [0, 1, 2, 3];

  let ac: AudioContext | null = null;
  let scheduler: MetronomeScheduler | null = null;
  let rafId: number | null = null;
  let uiQueue: { beat: number; time: number }[] = [];
  // Silent continuous source that keeps the iOS audio session live between the sparse
  // clicks (see lib/metronome/audio.ts). Held for the whole run; torn down on stop().
  let stopKeepAlive: (() => void) | null = null;

  // --- iOS diagnostics (temporary) -------------------------------------------------
  // Clicks route through masterGain; analyser taps it so we can see whether beats are
  // actually rendered (peak > 0) even when nothing is heard. `peakBuf` is reused each frame.
  let masterGain: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let peakBuf: Float32Array<ArrayBuffer> | null = null;
  let showDebug = $state(false);
  let dbg = $state({
    state: '–',
    now: 0,
    sampleRate: 0,
    baseLatency: '–',
    waker: '–',
    ticks: 0,
    clicks: 0,
    beatsDrawn: 0,
    keepAlive: false,
    peak: 0,
    peakMax: 0,
    err: '',
  });
  // Bumped on every start()/stop() so a resume() that resolves after the user has
  // already stopped (or restarted) cannot launch a stale/duplicate scheduler.
  let startToken = 0;

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
      dbg.waker = 'worker';
    } catch {
      // Fallback is still ONLY a waker (re-invokes the scan), never the beat time source.
      const intervalId = setInterval(cb, ms);
      wakers.set(id, { intervalId });
      dbg.waker = 'timeout';
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
    // Safety net: if iOS ever lets the context slip out of 'running' (e.g. an OS audio
    // interruption), nudge it back. The keep-alive normally prevents this; the resume is
    // idempotent on desktop and harmless while already running.
    if (ac.state !== 'running' && ac.state !== 'closed') void ac.resume().catch(() => {});
    const t = ac.currentTime;
    while (uiQueue.length && uiQueue[0].time <= t) {
      activeBeat = uiQueue.shift()!.beat;
      dbg.beatsDrawn++;
    }
    // Diagnostics: measure the actual output level so we can tell "rendered but not heard"
    // (peak spikes on beats) from "not rendered at all" (peak stays flat after beat 0).
    if (analyser && peakBuf) {
      analyser.getFloatTimeDomainData(peakBuf);
      let peak = 0;
      for (let i = 0; i < peakBuf.length; i++) {
        const a = Math.abs(peakBuf[i]);
        if (a > peak) peak = a;
      }
      dbg.peak = peak;
      if (peak > dbg.peakMax) dbg.peakMax = peak;
    }
    dbg.state = ac.state;
    dbg.now = ac.currentTime;
    rafId = requestAnimationFrame(draw);
  }

  function start(): void {
    const token = ++startToken;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    // Create the context synchronously inside the click handler (iOS gesture requirement).
    ac = ac ?? new Ctor();

    // Diagnostics + routing: build a master gain tapped by an analyser (once per context).
    if (!masterGain) {
      masterGain = ac.createGain();
      masterGain.gain.value = 1;
      masterGain.connect(ac.destination);
      analyser = ac.createAnalyser();
      analyser.fftSize = 1024;
      masterGain.connect(analyser); // passive tap; analyser needs no onward connection
      // Explicit ArrayBuffer backing so the type matches getFloatTimeDomainData's param.
      peakBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    }
    // Reset the counters for this run so the readout reflects the current session.
    dbg.sampleRate = ac.sampleRate;
    dbg.baseLatency =
      typeof ac.baseLatency === 'number' ? ac.baseLatency.toFixed(4) : 'n/a';
    dbg.ticks = 0;
    dbg.clicks = 0;
    dbg.beatsDrawn = 0;
    dbg.peak = 0;
    dbg.peakMax = 0;
    dbg.err = '';

    try {
      // Start the silent keep-alive within THIS gesture too, so the audio session stays live
      // from the first beat onward and later clicks don't render silently on iOS.
      stopKeepAlive?.();
      stopKeepAlive = startKeepAlive(ac);
      dbg.keepAlive = true;
    } catch (e) {
      dbg.keepAlive = false;
      dbg.err = `keepAlive: ${e instanceof Error ? e.message : String(e)}`;
    }
    running = true;
    // Start the draw loop now; it no-ops on an empty queue until the scheduler fills it.
    rafId = requestAnimationFrame(draw);

    // Anchor the schedule to the *live* clock. On iOS a fresh context is suspended with
    // currentTime frozen at 0; anchoring before resume() lands makes the opening beats fall
    // behind the clock (silent envelopes). So resume first, then start on the real currentTime.
    const launch = (): void => {
      if (token !== startToken || !running || !ac) return; // user stopped/restarted meanwhile
      const deps: SchedulerDeps = {
        now: () => ac!.currentTime,
        scheduleClick: (time, accent) => {
          if (!ac) return;
          try {
            playClick(ac, time, accent, masterGain ?? undefined);
            dbg.clicks++;
          } catch (e) {
            dbg.err = `click: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
        setWaker: (cb, ms) =>
          startWaker(() => {
            dbg.ticks++;
            cb();
          }, ms),
        clearWaker: (id) => stopWaker(id),
      };
      uiQueue = [];
      scheduler = new MetronomeScheduler(deps);
      scheduler.setBpm(bpm);
      scheduler.onBeat((beat, time) => uiQueue.push({ beat, time }));
      // Lead < scheduler aheadTime (0.1s) so the opening beat is caught by the first scan.
      scheduler.start(ac.currentTime + 0.08);
    };

    if (ac.state === 'suspended') {
      // Resolve on both fulfil and reject: a rejected resume() usually means the context is
      // already running (desktop), so we should still launch.
      void ac.resume().then(launch, launch);
    } else {
      launch();
    }
  }

  function stop(): void {
    startToken++; // invalidate any in-flight resume().then(launch)
    scheduler?.stop(); // clears the waker via SchedulerDeps.clearWaker
    scheduler = null;
    stopKeepAlive?.(); // end the silent keep-alive source
    stopKeepAlive = null;
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

    <!-- iOS audio diagnostics (temporary). Toggle, then Start, and read the values. -->
    <button class="dbg-toggle" type="button" onclick={() => (showDebug = !showDebug)}>
      {showDebug ? 'Debug ausblenden' : '🐞 Debug'}
    </button>
    {#if showDebug}
      <div class="dbg" role="status">
        <div><span>state</span><b class:bad={dbg.state !== 'running'}>{dbg.state}</b></div>
        <div><span>currentTime</span><b>{dbg.now.toFixed(3)}s</b></div>
        <div><span>sampleRate</span><b>{dbg.sampleRate}</b></div>
        <div><span>baseLatency</span><b>{dbg.baseLatency}</b></div>
        <div><span>waker</span><b>{dbg.waker}</b></div>
        <div><span>worker ticks</span><b class:bad={running && dbg.ticks === 0}>{dbg.ticks}</b></div>
        <div><span>clicks scheduled</span><b>{dbg.clicks}</b></div>
        <div><span>beats drawn</span><b>{dbg.beatsDrawn}</b></div>
        <div><span>keep-alive</span><b class:bad={!dbg.keepAlive}>{dbg.keepAlive ? 'on' : 'off'}</b></div>
        <div><span>peak (live)</span><b>{dbg.peak.toFixed(4)}</b></div>
        <div><span>peak (max)</span><b class:bad={running && dbg.beatsDrawn > 1 && dbg.peakMax < 0.01}>{dbg.peakMax.toFixed(4)}</b></div>
        <div class="dbg__err"><span>last error</span><b>{dbg.err || '—'}</b></div>
        <p class="dbg__hint">
          Start tippen, ~5&nbsp;s laufen lassen. Interessant: bleibt <b>peak (max)</b> nach dem
          ersten Klick bei ~0, während <b>clicks</b> und <b>beats</b> weiterzählen? → wird
          erzeugt, aber nicht gerendert. Springt <b>peak</b> im Takt, ohne dass du etwas hörst?
          → Ausgabe-/Session-Problem.
        </p>
      </div>
    {/if}
  </div>
</section>

<style>
  /* Temporary iOS diagnostics UI — remove once the metronome bug is fixed. */
  .dbg-toggle {
    margin-top: 4px;
    background: none;
    border: 1px solid var(--edge);
    color: var(--muted);
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
  }
  .dbg {
    width: 100%;
    max-width: 340px;
    margin-top: 10px;
    padding: 12px 14px;
    border: 1px solid var(--edge);
    border-radius: 12px;
    background: var(--track);
    font-family: var(--font-data, monospace);
    font-size: 13px;
    line-height: 1.5;
  }
  .dbg > div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .dbg span {
    color: var(--muted);
  }
  .dbg b {
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .dbg b.bad {
    color: var(--sharp, #e11d48);
  }
  .dbg__err {
    margin-top: 4px;
    border-top: 1px solid var(--edge);
    padding-top: 6px;
  }
  .dbg__err b {
    font-size: 11px;
    word-break: break-word;
    text-align: right;
  }
  .dbg__hint {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.4;
  }
</style>
