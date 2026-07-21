<script lang="ts">
  /**
   * Metronome panel (architecture §5, AC-10 / AC-13). BPM readout, four beat dots
   * (the downbeat carries the distinct `.beat--down` class), −/+ buttons + range,
   * and a Start/Stop control.
   *
   * Beat INSTANTS come only from `MetronomeScheduler` on the audio clock
   * (`AudioContext.currentTime`); they are NEVER derived from a timer (§0 NEVER rule).
   * Scheduling scans are driven PRIMARILY by the rAF draw loop (`scheduler.pump()`),
   * which is the reliable foreground waker — the Web-Worker waker stalls after ~1s on
   * iOS, so it is only a redundant secondary driver. The scan is idempotent, so both
   * drivers coexist safely. The dot is lit at the beat's audio time via the same rAF
   * loop draining a small queue, so the visual matches the sounded click.
   *
   * iOS silent-mode: `navigator.audioSession.type = 'playback'` is declared in the Start
   * gesture so the clicks sound even when the ringer/silent switch is on (Safari 16.4+).
   */
  import { onDestroy } from 'svelte';
  import { clampBpm, MetronomeScheduler } from '../lib/metronome/scheduler';
  import type { SchedulerDeps } from '../lib/metronome/scheduler';
  import { playClick } from '../lib/metronome/click';
  import { setAudioSessionType } from '../lib/audio/session';

  let { active = true }: { active?: boolean } = $props();

  let bpm = $state(120);
  let running = $state(false);
  let activeBeat = $state(-1);
  const beats = [0, 1, 2, 3];

  let ac: AudioContext | null = null;
  let scheduler: MetronomeScheduler | null = null;
  let rafId: number | null = null;
  let uiQueue: { beat: number; time: number }[] = [];
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

  /** Redundant secondary waker: prefer the Web Worker, fall back to a setTimeout interval. */
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
    // If iOS interrupts the context (e.g. an incoming call suspends it), resume it. The
    // call is idempotent while already running and harmless on desktop.
    if (ac.state !== 'running' && ac.state !== 'closed') void ac.resume().catch(() => {});
    // Drive scheduling from rAF — the RELIABLE foreground waker. The Web-Worker waker
    // stalls after ~1s on iOS, which froze the metronome after a few beats; this loop is
    // proven to keep running (it advances currentTime). pump() is idempotent, so it safely
    // coexists with the worker waker. We stop the metronome when backgrounded, so rAF
    // pausing while hidden is fine.
    scheduler?.pump();
    const t = ac.currentTime;
    while (uiQueue.length && uiQueue[0].time <= t) {
      activeBeat = uiQueue.shift()!.beat;
    }
    rafId = requestAnimationFrame(draw);
  }

  function start(): void {
    const token = ++startToken;
    // Declare playback audio FIRST (in-gesture) so iOS won't mute clicks in silent mode.
    setAudioSessionType('playback');
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    // Create the context synchronously inside the click handler (iOS gesture requirement).
    ac = ac ?? new Ctor();
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
          if (ac) playClick(ac, time, accent);
        },
        setWaker: (cb, ms) => startWaker(cb, ms),
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
