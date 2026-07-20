/**
 * Web-Audio microphone access layer (T6 / architecture §4.9).
 *
 * Responsibilities:
 *  - Expose the mandated getUserMedia constraints (all DSP processing OFF).
 *  - Feature-detect the microphone API (AC-8).
 *  - Acquire the AudioContext + mic stream from inside a user gesture, calling
 *    {@link AudioContext.resume} **synchronously** before the first `await`
 *    so iOS/Safari unlocks the context (AC-9).
 *  - Map platform failures to typed errors (AC-8 unavailable, permission denied).
 *
 * All Web-Audio touching code lives here; pure logic stays under `lib/pitch`.
 */

/**
 * getUserMedia audio constraints (AC-14 / boundary rule §0).
 *
 * echoCancellation / noiseSuppression / autoGainControl are all `false`:
 * a tuner needs the raw signal, and browser DSP would corrupt pitch/clarity.
 */
export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

/** getUserMedia rejected because the platform has no mic API (AC-8). */
export class MicUnavailableError extends Error {
  constructor(message = 'Microphone API is unavailable in this environment.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'MicUnavailableError';
  }
}

/** getUserMedia rejected because permission was denied (NotAllowedError). */
export class MicPermissionError extends Error {
  constructor(message = 'Microphone permission was denied.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'MicPermissionError';
  }
}

/** DOMException names that mean "the user/policy blocked mic access". */
const PERMISSION_ERROR_NAMES = new Set(['NotAllowedError', 'PermissionDeniedError', 'SecurityError']);

/**
 * Feature-detect the microphone API (AC-8).
 * @returns `true` only when `navigator.mediaDevices.getUserMedia` exists.
 */
export function micAvailable(nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined): boolean {
  return typeof nav?.mediaDevices?.getUserMedia === 'function';
}

/** Signature of the getUserMedia dependency (injectable for tests). */
type GetUserMedia = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

/**
 * Resolve the real platform getUserMedia, bound to `mediaDevices`, or
 * `undefined` when the API is absent. Never throws — the absent case is a
 * value, not an exception (AC-8: no throw-to-top).
 */
function platformGetUserMedia(): GetUserMedia | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const media = navigator.mediaDevices;
  if (typeof media?.getUserMedia !== 'function') return undefined;
  // Wrapper preserves the `this` binding to mediaDevices.
  return (constraints) => media.getUserMedia(constraints);
}

/** The resolved audio graph inputs, available once the mic stream is granted. */
export interface AudioReady {
  ctx: AudioContext;
  stream: MediaStream;
}

/**
 * Handle returned synchronously from {@link acquireAudio}: the context is
 * available immediately (already `resume()`-d inside the gesture), while
 * `ready` resolves once the mic stream is granted.
 */
export interface AudioHandle {
  ctx: AudioContext;
  ready: Promise<AudioReady>;
}

/** Injectable dependencies so {@link acquireAudio} is unit-testable. */
export interface AcquireAudioDeps {
  makeContext?: () => AudioContext;
  getUserMedia?: GetUserMedia;
}

/**
 * Default AudioContext factory with the legacy Safari/iOS `webkitAudioContext`
 * fallback. Throws {@link MicUnavailableError} if neither constructor exists —
 * callers of {@link acquireAudio} must guard the synchronous call (the gesture
 * handler wraps it in try/catch) so this never crashes the page (AC-8).
 */
function defaultMakeContext(): AudioContext {
  const Ctor =
    (typeof AudioContext !== 'undefined' ? AudioContext : undefined) ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    throw new MicUnavailableError('Web Audio (AudioContext) is not supported in this environment.');
  }
  return new Ctor();
}

/**
 * Await the mic stream and map platform failures to typed errors.
 * Kept as a separate async function so that {@link acquireAudio} can call
 * `ctx.resume()` synchronously *before* this ever suspends (AC-9).
 */
async function acquireStream(ctx: AudioContext, getUserMedia: GetUserMedia | undefined): Promise<AudioReady> {
  if (!getUserMedia) {
    throw new MicUnavailableError();
  }
  let stream: MediaStream;
  try {
    stream = await getUserMedia({ audio: AUDIO_CONSTRAINTS });
  } catch (err) {
    const name = (err as { name?: string } | null | undefined)?.name;
    if (name !== undefined && PERMISSION_ERROR_NAMES.has(name)) {
      throw new MicPermissionError(undefined, { cause: err });
    }
    // Non-permission failures (NotFoundError, NotReadableError, …) bubble up
    // unchanged so the caller can inspect them.
    throw err;
  }
  return { ctx, stream };
}

/**
 * Acquire the AudioContext + microphone stream (architecture §4.9, AC-9/14/8).
 *
 * CRITICAL (AC-9): the context is created and `ctx.resume()` is invoked
 * **synchronously** — before any `await` / microtask — so it runs inside the
 * user gesture that called this function. The returned `ready` promise then
 * resolves the mic stream. Callers MUST NOT `await` anything before calling
 * this, or the gesture-scoped resume guarantee is lost.
 *
 * getUserMedia is always called with `{ audio: AUDIO_CONSTRAINTS }` (AC-14).
 * A denied permission surfaces as {@link MicPermissionError}; a missing API
 * surfaces as {@link MicUnavailableError} via the rejected `ready` promise —
 * never as a synchronous throw (AC-8).
 */
export function acquireAudio(deps: AcquireAudioDeps = {}): AudioHandle {
  const makeContext = deps.makeContext ?? defaultMakeContext;
  const getUserMedia = deps.getUserMedia ?? platformGetUserMedia();

  const ctx = makeContext();
  // AC-9: synchronous resume, before the first await below.
  void ctx.resume();

  const ready = acquireStream(ctx, getUserMedia);
  return { ctx, ready };
}
