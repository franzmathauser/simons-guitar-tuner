/**
 * Web-Audio pitch pipeline (T6 / architecture §4.10).
 *
 * AnalyserNode + requestAnimationFrame + pitchy (MPM). No ScriptProcessorNode,
 * no FFT peak-picking, no network. Thin by design: it only pumps time-domain
 * samples through pitchy and forwards `{hz, clarity}` to `onFrame`. The pure
 * {@link TunerEngine} (elsewhere) owns all gating/smoothing.
 */
import { PitchDetector } from 'pitchy';

/** One raw pitch estimate. `[0, 0]` (from pitchy) means "no pitch found". */
export interface PitchFrame {
  hz: number;
  clarity: number;
}

/**
 * Create the analyser and wire the source into it (architecture §4.10).
 *
 * fftSize = 4096: a good time-domain window for guitar fundamentals
 * (~82–330 Hz) at typical sample rates. The returned analyser's `fftSize`
 * is the buffer length pitchy must operate on.
 */
export function makeAnalyser(ctx: AudioContext, src: AudioNode): AnalyserNode {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;
  src.connect(analyser);
  return analyser;
}

/**
 * Drives a requestAnimationFrame loop that reads time-domain samples from an
 * {@link AnalyserNode}, runs pitchy's MPM detector, and forwards each
 * `{hz, clarity}` frame to `onFrame`.
 *
 * pitchy returns `[0, 0]` when it cannot find a pitch — this class passes that
 * through unchanged; the engine gates it (`clarity < 0.9` / `hz <= 0`).
 */
export class PitchPipeline {
  private readonly analyser: AnalyserNode;
  private readonly sampleRate: number;
  private readonly onFrame: (frame: PitchFrame) => void;
  /** Detector allocated once (not per frame) to avoid per-frame GC churn. */
  private readonly detector: PitchDetector<Float32Array>;
  /** Reused time-domain buffer, length === analyser.fftSize. */
  private readonly buffer: Float32Array<ArrayBuffer>;
  private frameId: number | null = null;

  constructor(analyser: AnalyserNode, sampleRate: number, onFrame: (frame: PitchFrame) => void) {
    this.analyser = analyser;
    this.sampleRate = sampleRate;
    this.onFrame = onFrame;
    this.detector = PitchDetector.forFloat32Array(analyser.fftSize);
    this.buffer = new Float32Array(analyser.fftSize);
  }

  /** Start the rAF loop. Idempotent: a second call while running is a no-op. */
  start(): void {
    if (this.frameId !== null) return;
    const loop = (): void => {
      this.analyser.getFloatTimeDomainData(this.buffer);
      const [hz, clarity] = this.detector.findPitch(this.buffer, this.sampleRate);
      this.onFrame({ hz, clarity });
      this.frameId = requestAnimationFrame(loop);
    };
    this.frameId = requestAnimationFrame(loop);
  }

  /** Cancel the rAF loop. Idempotent: safe to call when not running. */
  stop(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }
}
