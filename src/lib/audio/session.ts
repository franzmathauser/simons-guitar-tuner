/**
 * WebKit Audio Session API helper (Safari 16.4+).
 *
 * iOS exposes a single, document-wide audio-session category via `navigator.audioSession`.
 * The two audio features of this app need DIFFERENT categories, and the setting is shared,
 * so each one must declare the category IT needs inside its own Start gesture:
 *
 *  - Metronome → 'playback': essential playback that must sound even when the ringer/silent
 *    switch is on (iOS otherwise mutes the Web Audio API in silent mode).
 *  - Tuner → 'play-and-record': a playback-only category rejects microphone capture with
 *    "AudioSession category is not compatible with audio capture", so the tuner must switch
 *    to a record-capable category before `getUserMedia`.
 *
 * Feature-detected and non-fatal: on browsers without the API this is a no-op and audio
 * behaves exactly as before.
 */
export type AudioSessionType =
  | 'auto'
  | 'playback'
  | 'transient'
  | 'transient-solo'
  | 'ambient'
  | 'play-and-record';

/** Declare the document-wide iOS audio-session category. No-op where unsupported. */
export function setAudioSessionType(type: AudioSessionType): void {
  try {
    const nav = navigator as unknown as { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = type;
  } catch {
    // Older iOS / unsupported value — ignore; audio still works with the default session.
  }
}
