/**
 * Audio-session helper tests. The metronome and tuner share one document-wide iOS session
 * category, so the helper must (a) set it when the API exists and (b) be a safe no-op when
 * it doesn't (desktop / older iOS). jsdom has no `navigator.audioSession`, so we install a
 * fake and restore it afterwards.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { setAudioSessionType } from './session';

const navAny = navigator as unknown as { audioSession?: { type: string } };

afterEach(() => {
  delete navAny.audioSession;
});

describe('setAudioSessionType', () => {
  it('sets navigator.audioSession.type when the API is available', () => {
    navAny.audioSession = { type: 'auto' };
    setAudioSessionType('play-and-record');
    expect(navAny.audioSession.type).toBe('play-and-record');

    setAudioSessionType('playback');
    expect(navAny.audioSession.type).toBe('playback');
  });

  it('is a no-op (no throw) when the API is unavailable', () => {
    expect(navAny.audioSession).toBeUndefined();
    expect(() => setAudioSessionType('playback')).not.toThrow();
  });
});
