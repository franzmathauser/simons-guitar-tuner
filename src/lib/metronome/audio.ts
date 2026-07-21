/**
 * iOS audio-session keep-alive for the metronome (architecture §4.11).
 *
 * The bug this fixes: on iOS the metronome played the FIRST click and then went silent
 * while the beat dots kept animating. The dots animating proves the scheduler kept
 * scanning and `playClick` kept firing every beat — so this was never a timing/threading
 * problem, and the earlier "clamp past-time envelopes" fix could not help (the beats were
 * not in the past).
 *
 * The real cause is iOS-specific: an `AudioContext` is only truly "live" right after the
 * user gesture that resumes it. The metronome's clicks are short and far apart, so between
 * them the audio session sits idle; iOS then lets the output route go to sleep and renders
 * subsequently-scheduled one-shot oscillators SILENTLY even though `currentTime` keeps
 * advancing (which is why the rAF dot loop keeps ticking). A `resume()` issued later from a
 * timer/worker (not a user gesture) resolves but does not re-open the route.
 *
 * The canonical remedy is to keep one continuous, inaudible source node playing for the
 * whole run: a looping single-sample silent buffer through a zero-gain node. A source that
 * never stops keeps the render graph and the hardware route active, so every scheduled
 * click renders. (Same technique Tone.js / howler use to keep iOS audio unlocked.)
 *
 * Kept dependency-injected against a minimal interface so it is unit-testable with a fake
 * context — jsdom has no real Web Audio.
 */

/** The minimal Web Audio surface the keep-alive needs (mirrors the `ClickAudio` doctrine). */
export interface KeepAliveAudio {
  readonly sampleRate: number;
  readonly destination: AudioNode;
  createBufferSource(): AudioBufferSourceNode;
  createGain(): GainNode;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer;
}

/**
 * Start a continuous silent source that keeps the audio session alive. Call this from
 * within the Start gesture. Returns an idempotent stop function that ends the source and
 * tears down its nodes; call it on Stop.
 */
export function startKeepAlive(ac: KeepAliveAudio): () => void {
  const source = ac.createBufferSource();
  // A one-sample, all-zero buffer looped forever — silent, but keeps a source "playing".
  source.buffer = ac.createBuffer(1, 1, ac.sampleRate);
  source.loop = true;

  // Zero-gain guarantees inaudibility even if the buffer were ever non-silent.
  const gain = ac.createGain();
  gain.gain.value = 0;

  source.connect(gain);
  gain.connect(ac.destination);
  source.start();

  let stopped = false;
  return (): void => {
    if (stopped) return;
    stopped = true;
    try {
      source.stop();
    } catch {
      // Already stopped / context closed — nothing to do.
    }
    source.disconnect();
    gain.disconnect();
  };
}
