# Research: Pitch Detection & PWA feasibility for a browser guitar tuner

Date: 2026-07-20. All claims cited inline. Frequencies of interest: standard tuning E2 = 82.41 Hz, A2 = 110 Hz, D3 = 146.83 Hz, G3 = 196 Hz, B3 = 246.94 Hz, E4 = 329.63 Hz.

Target accuracy: guitar tuners want ~±1–5 cents. 1 cent = 2^(1/1200) ≈ 1.000577 → ~0.0577 % of frequency. At E2 (82.41 Hz): 1 cent ≈ **0.0476 Hz**, 5 cents ≈ **0.238 Hz**.

---

## 1. Pitch detection algorithm for guitar

### Algorithm comparison at low fundamentals (82 Hz)

- **Time-domain methods (autocorrelation / YIN / McLeod MPM) are the right class for guitar's low fundamentals; raw FFT peak-picking is not.** Both YIN and MPM are refinements of autocorrelation. — https://en.wikipedia.org/wiki/Pitch_detection_algorithm , https://github.com/sevagh/pitch-detection
- **Autocorrelation-family methods need at least two pitch periods of signal to lock on.** "autocorrelation methods need at least two pitch periods to detect pitch — meaning that to detect a fundamental frequency of 40 Hz, at least 50 milliseconds of the signal must be analyzed." — https://github.com/audiojs/pitch (search-surfaced summary of audiojs/pitch README)
- **YIN is generally more accurate than plain autocorrelation, especially at low pitches**; it adds a cumulative-mean-normalized difference function + parabolic interpolation to remove octave errors. — https://pitchdetector.com/autocorrelation-vs-yin-algorithm-for-pitch-detection/ , https://www.cs.otago.ac.nz/research/publications/oucs-2008-03.pdf (McLeod & Wyvill, "A Smarter Way to Find Pitch")
- **MPM (McLeod)** uses a Normalized Square Difference Function (NSDF) and a clarity/peak-picking step; it is designed specifically for musical-instrument and voice pitch and gives a clarity confidence value that is very useful for a tuner's "signal present?" gate. — https://www.cs.otago.ac.nz/research/publications/oucs-2008-03.pdf , https://github.com/sevagh/pitch-detection/tree/master/misc/mcleod

### Why FFT/peak-picking struggles at low frequency (the core trade-off)

- **FFT bin resolution = sampleRate / N** (N = window length in samples). This is a hard floor on raw peak resolution:
  - fs=44100, N=2048 → **21.5 Hz/bin**
  - fs=44100, N=4096 → **10.8 Hz/bin**
  - fs=44100, N=8192 → **5.4 Hz/bin**
  - fs=44100, N=16384 → **2.7 Hz/bin**
- Compare to the target: cent-level accuracy at E2 needs ~**0.05–0.24 Hz** resolution. Even an 8192-point FFT bin (5.4 Hz ≈ ~110 cents at 82 Hz) is a whole semitone wide — so **raw FFT peak-picking cannot reach cent accuracy at 82 Hz** without heavy interpolation. Larger N buys resolution but costs latency (8192 samples ≈ 186 ms) and smears fast changes. This is the FFT bin-resolution vs. window-length vs. latency trade-off. — bin formula: https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/frequencyBinCount ; general FFT/autocorrelation trade-off: https://www.musicalboard.com/blog/2026-05-05-pitch-detection/
- **Time-domain methods sidestep the bin floor**: they find the signal *period* directly and refine it to sub-sample precision via parabolic interpolation, so cent accuracy is achievable from a much shorter window than FFT peak-picking would need. — https://www.cs.otago.ac.nz/research/publications/oucs-2008-03.pdf

### Sample rate & window/buffer size to resolve ~82 Hz with cent accuracy

- E2 period = 1/82.41 ≈ **12.1 ms ≈ 535 samples @ 44.1 kHz**.
- Autocorrelation/YIN/MPM need ≥2 periods (~24 ms, ~1070 samples) to lock; **≥3 periods is comfortable**. Practical windows:
  - **N = 2048** @ 44.1 kHz ≈ 46 ms ≈ ~3.8 periods of E2 — workable minimum, low latency.
  - **N = 4096** @ 44.1 kHz ≈ 93 ms ≈ ~7.6 periods — robust, still responsive; a good default for a guitar tuner.
- **Sample rate**: 44.1 or 48 kHz (default hardware rate) is plenty; the low fundamentals are the constraint, not the ceiling. Do NOT resample down. (16 kHz is fine for the fundamentals but only matters for ML models — see ml5/CREPE below.)
- Cent precision comes from **sub-sample period interpolation**, not from a bigger window. Two-period floor: https://github.com/audiojs/pitch ; parabolic-interpolation basis: https://www.cs.otago.ac.nz/research/publications/oucs-2008-03.pdf

### Concrete JS libraries

| Library | Algorithm | Latest release | Last commit | License | Size / form | AudioWorklet |
|---|---|---|---|---|---|---|
| **pitchy** (`ianprime0509/pitchy`) | McLeod / MPM (returns pitch + clarity 0–1) | **4.1.0, 2024-01-04** | 2024-04-09 | **0BSD** per README / MIT in npm metadata (both permissive) | tiny, **pure ESM**, dependency-free, operates on raw `Float32Array` + sampleRate | Yes (Web-Audio-agnostic; runnable inside an `AudioWorkletProcessor` if bundled into worklet scope — not documented, but follows from its pure-JS API) |
| **aubiojs** (`qiuxiang/aubiojs`) | aubio's YIN / yinfft (O(N log N)) via WASM | **0.2.1, 2022-11-08** | 2023-08-17 | **GPL** (npm field "None"; wraps GPL-licensed aubio → copyleft) | WASM bundle (emscripten), larger | Yes in principle (WASM), but stale + GPL |
| **pitchfinder** (`peterkhayes/pitchfinder`) | Multiple: YIN, AMDF, ACF2+, Macleod, YINFFT, DynamicWavelet | **2.3.4, 2025-12-16** | 2025-12-16 (actively maintained) | **GPL-3.0 (copyleft)** | JS, works node + browser on Float32Array | Yes (pure JS) — but GPLv3 is a licensing constraint |
| **ml5.js pitchDetection** (CREPE) | CREPE deep-learning model, trained @ 16 kHz | ml5 **1.3.1 (2025-11-24)** | — | MIT | large (TF.js + model weights) | N/A |
| **Chris Wilson PitchDetect** (`cwilso/PitchDetect`) | Autocorrelation (real-time) | demo, not published to npm | 2022-09-14 | MIT | **Demo/reference app, not a library**; uses `AnalyserNode.getFloatTimeDomainData` + `requestAnimationFrame` | No (uses AnalyserNode polling) |

Links: https://www.npmjs.com/package/pitchy , https://github.com/ianprime0509/pitchy , https://www.npmjs.com/package/aubiojs , https://github.com/qiuxiang/aubiojs , https://www.npmjs.com/package/pitchfinder , https://github.com/peterkhayes/pitchfinder , https://github.com/cwilso/PitchDetect

**Critical maintenance/licensing findings:**
- **ml5.js pitchDetection is effectively gone in current ml5.** The 1.x rewrite (`ml5-next-gen`) `src/` contains BodyPose, FaceMesh, HandPose, ImageClassifier, NeuralNetwork, SoundClassifier, etc. — **no PitchDetection module**. CREPE pitch detection existed only in the archived legacy `ml5-library` (0.x), and users reported the hosted model went missing. CREPE is also heavyweight (TF.js + neural net, 16 kHz) — overkill/high-latency for a tuner. — https://github.com/ml5js/ml5-next-gen , https://github.com/ml5js/ml5-library/issues/1489
- **pitchfinder and aubiojs are GPL** — copyleft. For a shipped PWA this can force source disclosure. **pitchy (0BSD/MIT) is the only permissive, actively-recent, dependency-free option.**
- Optional realtime WASM+AudioWorklet reference: `sevagh/pitchlite` (McLeod/YIN in WASM designed for AudioWorklet). — https://github.com/sevagh/pitchlite

---

## 2. Web Audio real-time analysis

### AudioWorklet vs. ScriptProcessorNode vs. AnalyserNode polling

- **ScriptProcessorNode is deprecated** and runs on the main thread (blocks UI, glitch-prone). **AudioWorklet is its official replacement**, running audio code on a dedicated audio-render thread, receiving 128-sample quanta, communicating with the main thread via a message port. — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet , https://developer.chrome.com/blog/audio-worklet
- **AnalyserNode.getFloatTimeDomainData polled from requestAnimationFrame** is the simplest approach (what Chris Wilson's PitchDetect does) and is fine for a tuner: pitch UI only needs ~30–60 Hz update rate, and rAF is throttled to the display. Downside: runs on the main thread and is coupled to frame rendering; can drop samples under load. — https://github.com/cwilso/PitchDetect
- **2025/2026 recommendation: AudioWorklet** for robust, jank-free real-time analysis — audio thread is isolated from UI/GC pauses. Use AnalyserNode+rAF only for a quick MVP. — https://developer.chrome.com/blog/audio-worklet , https://www.musicalboard.com/blog/2026-05-05-pitch-detection/
- **Browser support:** AudioWorklet is widely available / Baseline — Chrome 66+ (2018), Firefox 76+, Safari 14.1+ (2021). — https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet , https://developer.chrome.com/blog/audio-worklet

### getUserMedia audio constraints for accurate analysis

- **The three DSP "cleanup" features actively alter the raw waveform**, per MDN:
  - `autoGainControl` — "automatically manages changes in the volume ... to maintain a steady overall volume level." — https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackSettings/autoGainControl
  - `noiseSuppression` — removes background noise from the signal. — https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints
  - `echoCancellation` — removes audio (e.g. speaker feedback) from the mic input. — https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/echoCancellation
  - **Defaults are all `true`** in getUserMedia. — https://blog.addpipe.com/getusermedia-audio-constraints/
- **Recommendation: disable all three for pitch/frequency analysis** (`echoCancellation:false, noiseSuppression:false, autoGainControl:false`). They are tuned for speech/VoIP and distort amplitude and spectral content, harming pitch and level accuracy. — https://blog.addpipe.com/getusermedia-audio-constraints/
- **Intellectual-honesty note:** MDN *documents that these features modify the signal* but does **not** itself print an explicit "disable for pitch analysis" recommendation on the constraint pages checked (autoGainControl, echoCancellation, MediaTrackConstraints). The "disable for analysis" guidance is a well-established practitioner consensus (addpipe) that follows directly from the MDN-documented behavior — treat it as best practice, not a literal MDN directive. Also note WebKit historically ignored the `echoCancellation` constraint on some versions. — https://bugs.webkit.org/show_bug.cgi?id=179411

---

## 3. PWA microphone + installability caveats

- **getUserMedia requires a secure context (HTTPS).** MDN: "The `getUserMedia()` method is only available in secure contexts ... If a document isn't loaded in a secure context, the `navigator.mediaDevices` property is `undefined`." Secure context = HTTPS/TLS, or `localhost`/`127.0.0.1`, or `file:///`. User permission is always required. — https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

### iOS Safari specifics

- **Installed (Add-to-Home-Screen / standalone) PWAs CAN access the microphone.** The long-standing WebKit bug "getUserMedia not working in apps added to home screen that run in standalone mode" is **RESOLVED FIXED as of iOS 13.4** (March 2020); confirmed working on 13.4+ and current iOS. So iOS 16/17/18 standalone PWAs have mic access. — https://bugs.webkit.org/show_bug.cgi?id=185448
- **Caveat — WKWebView / third-party iOS browsers:** getUserMedia only works in Safari/WebKit's own web views. Chrome/Firefox/Edge on iOS (WKWebView) historically could NOT use getUserMedia. Only Safari-launched home-screen PWAs are reliable. — https://bugs.webkit.org/show_bug.cgi?id=185448
- **Known iOS quirks:** on iOS, activating the mic can force audio output to the built-in speaker; per-load random device IDs (can't persist a chosen device); a second getUserMedia call for the same type can mute the first track. — https://webrtchacks.com/guide-to-safari-webrtc/ , https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
- **AudioContext requires a user gesture.** On iOS, an AudioContext starts `suspended` and must be `resume()`d inside a user-gesture handler (touchstart/click). Wire "Start tuner" to `audioContext.resume()`. — https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state , https://www.mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos , https://bugs.webkit.org/show_bug.cgi?id=180522
- **EU/DMA note:** iOS 17.4 briefly changed EU PWA behavior (non-standalone); Apple reversed this, standalone PWAs remain. Worth a note but not a blocker. — https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide

### Minimum for installability + offline

- **Manifest (Chromium install criteria):** `name` or `short_name`; `icons` incl. **192px and 512px**; `start_url`; `display` (and/or `display_override`); `prefer_related_applications` false/absent. Must be served over **HTTPS** (or localhost) and linked via `<link rel="manifest">`. — https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- **Service worker is NOT required for installability** ("While not a requirement for a PWA to be installable, many PWAs use service workers to provide an offline experience"). — https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- **Fully offline tuner: yes.** A tuner needs only the mic (local) + Web Audio (local compute) — no network at runtime. A service worker precaching the app shell (HTML/JS/WASM/manifest/icons) makes it work with zero network after install. **iOS caveat: ~7-day cache eviction** if the PWA isn't opened within a week. — https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide

---

## 4. Metronome timing

- **Why setInterval/setTimeout drift:** they run on the main JS thread and are only millisecond-precise; the fired callback "can easily be skewed by tens of milliseconds or more by layout, rendering, garbage collection, and XMLHttpRequest and other callbacks." Cumulative jitter = audible, drifting tempo. — https://web.dev/articles/audio-scheduling (Chris Wilson, "A Tale of Two Clocks")
- **Recommended pattern — lookahead scheduler over two clocks:** use an imprecise `setTimeout`/`setInterval` loop only as a *periodic waker*, and schedule the actual note events on the **sample-accurate Web Audio clock** (`AudioContext.currentTime`) via `oscillator/source.start(time)`. Each wake-up schedules every beat falling inside a short lookahead window.
  - Suggested values: **interval ≈ 25 ms**, **scheduleAheadTime ≈ 100 ms** (0.1 s). The overlap makes it resilient to main-thread stalls; the cost is ~0.1 s latency before a tempo change takes effect. — https://web.dev/articles/audio-scheduling
- Reusable implementations of this exact technique: **WAAClock** (https://github.com/sebpiq/WAAClock). MDN also documents the lookahead pattern. — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques
- **Best practice:** run the scheduler loop in a Web Worker (or AudioWorklet) so the timer wake-ups aren't starved by main-thread work — the successor pattern Wilson recommends. — https://web.dev/articles/audio-scheduling

---

## Recommendations for this project

- **Algorithm:** **McLeod Pitch Method (MPM)** — accurate at low guitar fundamentals, needs only a short (~2–4 period) window, and its built-in clarity value doubles as a "note present?" gate. (YIN is a close, equally valid alternative.)
- **Library:** **pitchy 4.x** — MPM, actively recent (2024), permissive **0BSD/MIT**, zero-dependency pure ESM on `Float32Array`. Decisive vs. GPL-encumbered pitchfinder/aubiojs and the removed ml5 CREPE.
- **Analysis API:** **AudioWorklet** feeding pitchy on the audio thread for the production build (fall back to `AnalyserNode.getFloatTimeDomainData` + `requestAnimationFrame` for a fast MVP). Set getUserMedia `echoCancellation/noiseSuppression/autoGainControl: false`.
- **Timing pattern:** **Web Audio lookahead scheduler** (Chris Wilson "A Tale of Two Clocks": ~25 ms timer, ~100 ms lookahead, events on `AudioContext.currentTime`), scheduler loop ideally in a Web Worker.
- **PWA:** HTTPS + minimal manifest (192/512 icons, start_url, display) + a precaching service worker → installable and **fully offline**. On iOS, `resume()` the AudioContext from the Start-button gesture; standalone-PWA mic works since iOS 13.4 (Safari/WebKit only, not WKWebView browsers); mind the iOS ~7-day cache eviction.
