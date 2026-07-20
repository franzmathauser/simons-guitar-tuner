/**
 * Metronome waker Web Worker (D-21, architecture.md §4.12).
 *
 * On a `start` message it fires `{ type: 'tick' }` on its own `setInterval` every `ms`;
 * on `stop` it clears that interval. This `setInterval` is a WAKER ONLY — it exists to
 * re-invoke the main-thread scheduling scan on a background thread that keeps ticking
 * when the tab is throttled/backgrounded. It is NOT the beat time source: beat instants
 * are computed on the audio clock in `scheduler.ts`. The §0 NEVER rule bans setInterval
 * as the beat *time source*, not as a waker, so this is allowed.
 *
 * The main thread wires this to `SchedulerDeps.setWaker`/`clearWaker` and drives the
 * scheduler's `now()` from `AudioContext.currentTime`.
 */

/** Minimal dedicated-worker surface — declared locally to avoid pulling the whole
 *  `webworker` lib alongside the project's `DOM` lib (which would clash on `self`). */
interface WorkerContext {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
}

type WakerMessage = { type: 'start'; ms?: number } | { type: 'stop' };

const ctx = self as unknown as WorkerContext;

let intervalId: ReturnType<typeof setInterval> | null = null;

function stop(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

ctx.onmessage = (event: MessageEvent): void => {
  const data = event.data as WakerMessage;
  if (data.type === 'start') {
    const ms = data.ms ?? 25;
    stop(); // never leak a previous interval
    intervalId = setInterval(() => ctx.postMessage({ type: 'tick' }), ms);
  } else if (data.type === 'stop') {
    stop();
  }
};

export {};
