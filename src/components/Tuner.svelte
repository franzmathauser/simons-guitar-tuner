<script lang="ts">
  /**
   * Tuner panel (architecture §5). Owns a `TunerEngine` for the active tuning and
   * the Web-Audio graph. A Start/Stop control gates the mic; on START the mic is
   * acquired SYNCHRONOUSLY (no await before `acquireAudio()`) so `ctx.resume()`
   * runs inside the user gesture (AC-9). Feature/permission failures surface as
   * an actionable message instead of crashing (AC-8). The readout, gauge, avatar
   * and headstock all re-render reactively from the engine `reading`; when there
   * is no signal the gauge freezes and the status shows "kein Ton" (AC-6).
   */
  import { onDestroy, untrack } from 'svelte';
  import { TunerEngine } from '../lib/pitch/engine';
  import type { TunerReading } from '../lib/pitch/engine';
  import type { Tuning } from '../lib/tuning/types';
  import {
    acquireAudio,
    micAvailable,
    MicPermissionError,
    MicUnavailableError,
  } from '../lib/audio/mic';
  import { makeAnalyser, PitchPipeline } from '../lib/audio/pipeline';
  import Gauge from './Gauge.svelte';
  import Avatar from './Avatar.svelte';
  import Headstock from './Headstock.svelte';

  let { tuning, active = true }: { tuning: Tuning; active?: boolean } = $props();

  // Engine is created once from the initial tuning; later changes flow through
  // the $effect below (setTuning). untrack marks the read as intentionally
  // non-reactive here.
  const engine = new TunerEngine(untrack(() => tuning));

  // A low-clarity frame returns the well-defined initial frozen reading.
  let reading = $state<TunerReading>(engine.update({ hz: 0, clarity: 0 }));
  let running = $state(false);
  let errorMsg = $state<string | null>(null);
  let selectedIndex = $state(0);

  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let pipeline: PitchPipeline | null = null;
  // Bumped on every start()/stop(). A pending async acquire whose generation no
  // longer matches is stale and must release its own resources instead of wiring
  // them up — prevents the Start→Stop / double-tap zombie-mic race.
  let startGen = 0;

  // Keep the engine's tuning in sync with the prop.
  $effect(() => {
    engine.setTuning(tuning);
  });

  // Stop the mic when the user navigates away from the tuner tab (privacy: the
  // panel is only hidden, not unmounted, so nothing else releases the stream).
  $effect(() => {
    if (!active && running) stop();
  });

  // Stop the mic when the document is hidden (backgrounded / tab switch).
  $effect(() => {
    const onVis = (): void => {
      if (document.hidden && running) stop();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  });

  function teardownAudio(): void {
    pipeline?.stop();
    pipeline = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    void ctx?.close();
    ctx = null;
  }

  // The readout note/target follow the selected string from the (flat-spelled)
  // tuning data — never freqToNote's sharp spelling (architecture §4.4 NIT).
  const displayString = $derived(tuning.strings[selectedIndex] ?? tuning.strings[0]);
  const stateColor = $derived(
    reading.state === 'ok' ? 'var(--good)' : reading.state === 'low' ? 'var(--flat)' : 'var(--sharp)'
  );
  const centsText = $derived(
    reading.hasSignal ? `${reading.displayCents > 0 ? '+' : ''}${reading.displayCents} ¢` : '– ¢'
  );
  const measuredText = $derived(reading.hasSignal ? reading.measuredHz.toFixed(1) : '–');
  const statusText = $derived(
    !running
      ? 'Auf Start tippen zum Stimmen'
      : !reading.hasSignal
        ? 'kein Ton – spiel eine Saite'
        : reading.state === 'ok'
          ? 'gestimmt ✓'
          : reading.state === 'low'
            ? 'zu tief – höher stimmen ↑'
            : 'zu hoch – tiefer stimmen ↓'
  );

  function start(): void {
    errorMsg = null;
    // AC-9: guard + acquire SYNCHRONOUSLY — no await before acquireAudio() so
    // ctx.resume() (inside it) runs within this gesture.
    if (!micAvailable()) {
      errorMsg =
        'Kein Mikrofonzugriff in dieser Umgebung. Bitte in einem Browser über HTTPS (oder localhost) mit Mikrofon öffnen.';
      return;
    }
    const myGen = ++startGen;
    // acquireAudio() creates + resume()s the context synchronously; guard it so a
    // constructor throw (e.g. no AudioContext / context-limit) surfaces as an
    // actionable message instead of crashing the gesture handler (AC-8).
    let handle: ReturnType<typeof acquireAudio>;
    try {
      handle = acquireAudio();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unbekannter Fehler';
      errorMsg = `Mikrofon/Audio konnte nicht gestartet werden (${msg}).`;
      return;
    }
    running = true;
    handle.ready
      .then(({ ctx: audioCtx, stream: micStream }) => {
        // Stale: Stop was pressed or a newer Start began while getUserMedia was
        // pending. Release these resources instead of wiring up a zombie mic.
        if (myGen !== startGen) {
          micStream.getTracks().forEach((t) => t.stop());
          void audioCtx.close();
          return;
        }
        ctx = audioCtx;
        stream = micStream;
        try {
          const src = audioCtx.createMediaStreamSource(micStream);
          const analyser = makeAnalyser(audioCtx, src);
          pipeline = new PitchPipeline(analyser, audioCtx.sampleRate, (f) => {
            reading = engine.update(f);
            selectedIndex = reading.stringIndex;
          });
          pipeline.start();
        } catch (wireErr) {
          // Wire-up failed after the stream was granted: release everything
          // (stops tracks + closes ctx exactly once) so the mic can't stay live.
          teardownAudio();
          running = false;
          const msg = wireErr instanceof Error ? wireErr.message : 'unbekannter Fehler';
          errorMsg = `Audio-Pipeline konnte nicht initialisiert werden (${msg}).`;
        }
      })
      .catch((err: unknown) => {
        // acquireStream rejected → module ctx was never adopted; close the orphan once.
        void handle.ctx.close();
        if (myGen !== startGen) return; // a newer start owns the UI now
        running = false;
        if (err instanceof MicPermissionError) {
          errorMsg =
            'Mikrofonzugriff verweigert. Bitte erlaube den Zugriff in den Browser-Einstellungen und tippe erneut auf Start.';
        } else if (err instanceof MicUnavailableError) {
          errorMsg =
            'Kein Mikrofon gefunden. Schließe ein Mikrofon an oder nutze ein Gerät mit Mikrofon.';
        } else {
          const msg = err instanceof Error ? err.message : 'unbekannter Fehler';
          errorMsg = `Mikrofon konnte nicht gestartet werden (${msg}).`;
        }
      });
  }

  function stop(): void {
    startGen++; // invalidate any in-flight acquire (its .then/.catch will self-release)
    teardownAudio();
    running = false;
    engine.reset();
    reading = engine.update({ hz: 0, clarity: 0 });
  }

  function toggle(): void {
    if (running) stop();
    else start();
  }

  function onPeg(idx: number): void {
    engine.setManualOverride(idx); // manual lock (AC-4 / D-3)
    selectedIndex = idx;
  }

  onDestroy(() => {
    startGen++;
    teardownAudio();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<section class="panel" hidden={!active} role="tabpanel" aria-label="Stimmen">
  <div class="status" class:status--idle={!running}>
    <span class="status__dot" aria-hidden="true"></span>
    <span>{statusText}</span>
  </div>

  {#if errorMsg}
    <div class="tuner-error" role="alert">{errorMsg}</div>
  {/if}

  <div class="readout">
    <div class="note" style="--state:{stateColor}" aria-live="polite">
      <span class="note__name">{displayString.note}</span><span class="note__acc"
        >{displayString.accidental}</span
      ><span class="note__oct">{displayString.octave}</span>
    </div>
    <div class="readout__data">
      <span>Ziel <b>{displayString.targetHz.toFixed(2)}</b> Hz</span>
      <span class="cents" style="--state:{stateColor}">{centsText}</span>
      <span><b>{measuredText}</b> Hz</span>
    </div>
  </div>

  <div class="meter-row">
    <Gauge cents={reading.cents} state={reading.state} hasSignal={reading.hasSignal} />
    <Avatar state={reading.state} />
  </div>

  <Headstock {tuning} {selectedIndex} onselect={onPeg} />

  <div class="tuner-actions">
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
      <span>{running ? 'Stopp' : 'Start'}</span>
    </button>
  </div>
</section>
