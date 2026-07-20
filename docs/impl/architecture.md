# Ton-Gemetzel — Implementation Architecture & Module Contracts

> **Single source of truth for all implementation subagents.**
> Grounded in `../brainstorm/2026-07-20-gitarren-stimmgeraet-pwa/spec.md` +
> `../brainstorm/2026-07-20-gitarren-stimmgeraet-pwa/decisions.md`.
> The mockup `mockup.html` is the **binding visual reference** (approved: F-19).
> When anything is ambiguous, consult the Decision Journal FIRST.

## 0. Ground rules (Boundaries — from spec)

- **ALWAYS**: HTTPS/localhost only; `AudioContext.resume()` **only from a user gesture**;
  getUserMedia with `echoCancellation/noiseSuppression/autoGainControl = false`; permissive
  licenses only (pitchy 0BSD/MIT); smoothed + hysteresis values to the UI.
- **NEVER**: `setInterval`/`setTimeout` as the **time source for beat instants** (waker only is fine);
  FFT peak-picking as primary pitch detection; sending audio/freq data to any server;
  `ScriptProcessorNode`.
- **ASK FIRST** (do NOT silently change): clarity `0.9`, in-tune `±5¢`, auto-select `±80¢`.
  These are fixed constants in v1.

## 1. Tech stack (D-5, D-9)

- **Svelte 5** (runes) + **Vite** + **TypeScript**.
- **pitchy 4.x** (MPM, returns `[pitch, clarity]` on a `Float32Array`).
- **vite-plugin-pwa** (Workbox) for manifest + offline precache.
- **Vitest** (jsdom env) + **@testing-library/svelte** for unit/component tests.
- A4 = **440 Hz** fixed (D-14).

## 1b. Environment constraints (from the setup agent — MUST respect)

- Resolved versions: **svelte 5.56.6, vite 8.1.5, @sveltejs/vite-plugin-svelte 7.2.0, vitest 4.1.10,
  vite-plugin-pwa 1.3.0, pitchy 4.1.0, typescript 5.9.3**.
- **`tsconfig` has `verbatimModuleSyntax: true`** → all type-only imports MUST use `import type { … }`.
  `moduleResolution: "bundler"`, `target: ES2022`, `strict: true`.
- **Do NOT bump TypeScript to 7.x** — `svelte-check` crashes on it; TS is pinned to 5.9.3.
- **Vitest config lives inside `vite.config.ts`** (from `vitest/config`): `environment:'jsdom'`,
  `globals:true`, `setupFiles:['./tests/setup.ts']`. Colocate `*.test.ts` next to sources.
- Use Svelte 5 **runes** (`$state`, `$derived`, `$props`, `$effect`) and `mount()` in `main.ts`.
- Avatars already exist at `src/lib/assets/avatar-{low,ok,high}.png` — import them, don't recreate.
- `app.css` already holds the theme tokens (light/dark/`data-theme`) — append component CSS, don't rewrite tokens.
- `vite-plugin-pwa` is already wired minimally in `vite.config.ts` with a `TODO(pwa-agent)` block; the PWA
  task owns the real manifest/icons. There is **no `public/` dir yet**.
- pitchy `findPitch` returns `[0,0]` (not NaN) when no pitch is found.

## 2. Directory layout (recommended per D-24; this is the agreed layout)

```
src/
  lib/
    tuning/
      types.ts            # GuitarString, Tuning, TuningId, Accidental
      tunings.ts          # TUNINGS record (AC-7)
    pitch/
      cents.ts            # centsBetween() — core primitive
      note.ts             # freqToNote() (AC-1)
      state.ts            # centsToState() (AC-2)
      select.ts           # selectTarget() (AC-3)
      smooth.ts           # MedianSmoother + HysteresisState (AC-5)
      engine.ts           # TunerEngine (AC-4, AC-6) — pure, no Web Audio
    audio/
      mic.ts              # constraints + feature detect + gesture unlock (AC-8/9/14)
      pipeline.ts         # AnalyserNode + rAF + pitchy -> {hz,clarity}
    metronome/
      scheduler.ts        # lookahead scheduler + clampBpm (AC-10, AC-13)
      worker.ts           # Web Worker waker (D-21)
    assets/
      avatar-low.png avatar-ok.png avatar-high.png   # extracted from mockup
  components/
    App.svelte Tuner.svelte Metronome.svelte
    Gauge.svelte Headstock.svelte Avatar.svelte
  app.css                 # theme tokens (ported 1:1 from mockup :root blocks)
  main.ts
tests/ or *.test.ts colocated
```

All pure logic lives under `lib/` with **zero DOM / Web Audio imports** so it is unit-testable in
jsdom/node. Web Audio touches only `audio/`, `metronome/`, and `components/`.

## 3. Data flow

```
[gesture] Tuner.start()
  -> mic.acquireAudio(): new AudioContext; ctx.resume() SYNC (AC-9); getUserMedia(constraints=false) (AC-14/AC-8)
  -> AnalyserNode(fftSize=4096) <- MediaStreamSource
  -> PitchPipeline (rAF loop): getFloatTimeDomainData -> pitchy.findPitch -> {hz, clarity}
  -> TunerEngine.update({hz,clarity})
        clarity<0.9 || !finite(hz)  -> FREEZE (return last reading, hasSignal=false)   (AC-6)
        else: median-smooth hz; pick string (manual override locks it, else selectTarget±80¢) (AC-3/AC-4)
              cents = centsBetween(medianHz, targetHz); hysteresis-state(cents) (AC-2/AC-5)
  -> reactive UI: note readout, gauge needle+color, avatar pose, lit peg
```

Metronome is independent: `MetronomeScheduler` schedules beat instants on `AudioContext.currentTime`
(AC-10), a Web Worker fires the ~25 ms waker (D-21), UI draws 4 dots with accented downbeat (AC-13).

## 4. Contracts (exact signatures — implement to these)

### 4.1 `tuning/types.ts`
```ts
export type Accidental = '' | '♭' | '♯';
export type TuningId = 'standard' | 'dropd' | 'halfstep' | 'openg';
export interface GuitarString { note: string; accidental: Accidental; octave: number; targetHz: number; }
export interface Tuning { id: TuningId; label: string; strings: GuitarString[]; /* len 6, low->high */ }
```

### 4.2 `tuning/tunings.ts` (AC-7) — target Hz MUST match mockup TUNINGS exactly
```ts
export const TUNINGS: Record<TuningId, Tuning>;
export const TUNING_ORDER: TuningId[]; // ['standard','dropd','halfstep','openg']
```
Reference Hz (A4=440):
- **standard**: E2 82.41 · A2 110.00 · D3 146.83 · G3 196.00 · B3 246.94 · E4 329.63
- **dropd**:    D2 73.42 · A2 110.00 · D3 146.83 · G3 196.00 · B3 246.94 · E4 329.63
- **halfstep** (♭): E♭2 77.78 · A♭2 103.83 · D♭3 138.59 · G♭3 185.00 · B♭3 233.08 · E♭4 311.13
- **openg**:    D2 73.42 · G2 98.00 · D3 146.83 · G3 196.00 · B3 246.94 · D4 293.66

Header dropdown labels (from mockup): standard "E A D G B E", dropd "Drop D",
halfstep "½ Ton tiefer", openg "Open G".

### 4.3 `pitch/cents.ts`
```ts
export function centsBetween(hz: number, refHz: number): number; // 1200*log2(hz/refHz)
```

### 4.4 `pitch/note.ts` (AC-1)
```ts
export interface NoteReading { note: string; accidental: Accidental; octave: number; cents: number; }
export function freqToNote(hz: number, a4?: number /* =440 */): NoteReading;
```
DoD tests (cent error < 1¢): 82.41→E2/0, 146.83→D3/0, 329.63→E4/0, 151.0→D3/≈+48.
Uses 12-TET grid: `midi = 69 + 12*log2(hz/a4)`; nearest = round; cents=(midi-nearest)*100;
name via `['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']`, split into note+accidental;
octave = floor(nearest/12) - 1.
**Runtime-path NIT (plan-review):** `freqToNote` spells with SHARPS only. It is a standalone utility for
AC-1 and is NOT on the tuner display path — the readout shows the *selected `GuitarString`* from the tuning
data (flat-spelled where relevant, e.g. `E♭`). Do NOT feed `freqToNote`'s output into the note readout, or
sharp/flat spellings would clash in one display.

### 4.5 `pitch/state.ts` (AC-2)
```ts
export type TuneState = 'ok' | 'low' | 'high';
export function centsToState(cents: number): TuneState; // |c|<=5 ok; c<0 low; c>0 high
```
DoD: cents∈{−5,0,+5}⇒'ok'; {−6,+6}⇒≠'ok'.

### 4.6 `pitch/select.ts` (AC-3)
```ts
export function selectTarget(hz: number, strings: GuitarString[], windowCents?: number /* =80 */): number | null;
```
Nearest string by |centsBetween(hz, targetHz)|; return its index if min ≤ windowCents else `null`.
DoD: representative freqs → correct index; out-of-window → null.

### 4.7 `pitch/smooth.ts` (AC-5, D-18/D-20)
```ts
export class MedianSmoother { constructor(size?: number /* =5 */); push(hz: number): number; reset(): void; }
export class HysteresisState {
  constructor(inTune?: number /* =5 */, margin?: number /* =3 */);
  update(cents: number): TuneState;   // must exceed (inTune+margin) to LEAVE 'ok'; within inTune to ENTER 'ok'
  get state(): TuneState;
  reset(): void;
}
```
**Exact band logic** (must be implemented and tested EXACTLY as below — resolves the plan-review
"opposite-sign dead-band" finding). `raw = centsToState(cents)` (reuse the SAME function/`inTune`
constant so the two cannot drift — resolves the coupling NIT):
```
S = current state
if raw === S:            return S
if S === 'ok':
    // sticky: leave 'ok' only when clearly out of tune
    if |cents| > inTune + margin:  return cents < 0 ? 'low' : 'high'
    else:                          return 'ok'          // hold (anti-flicker band 5..8)
else:  // S is 'low' or 'high'
    if raw === 'ok':     return 'ok'                     // enter ok as soon as |cents| ≤ inTune (keeps ±5 semantics)
    else:                return raw                      // opposite side (sign flipped past ok) → SNAP, never stay wrong-signed
```
This keeps the ±5 in-tune *entry* threshold (D-12) while adding hysteresis on the *leaving* side
(D-20), and can never get stuck showing 'low' while sharp (or vice versa).
DoD tests:
- Oscillation around +5 from ok, e.g. `[0,4,6,4,6,4,6]` ⇒ transitions ≤ 2 (ideally 0 after settling). `centsToState` alone would toggle every step — asserts the band is real, not tautological.
- **Opposite-sign snap**: start 'low' (feed −12), then feed +12 ⇒ state becomes 'high' (never stuck 'low').
- **Enter-ok**: from 'high' (feed +12) then feed +4 ⇒ 'ok'.
- `MedianSmoother.push` unit-tested (odd/even window, ordering, `reset()` clears history).

### 4.8 `pitch/engine.ts` (AC-4, AC-6) — PURE, no Web Audio
```ts
export interface TunerReading {
  hasSignal: boolean; stringIndex: number; note: GuitarString;
  cents: number;        // smoothed deviation from target (needle)
  displayCents: number; // Math.round(cents)
  state: TuneState; measuredHz: number;
}
export interface TunerEngineOptions {
  clarityThreshold?: number; // 0.9
  autoWindowCents?: number;  // 80
  medianSize?: number;       // 5
  hysteresisMargin?: number; // 3
}
export class TunerEngine {
  constructor(tuning: Tuning, opts?: TunerEngineOptions);
  setTuning(t: Tuning): void;               // clamp stringIndex to 0..5
  setManualOverride(idx: number | null): void; // null = auto (AC-3/AC-4)
  get manualOverride(): number | null;
  update(frame: { hz: number; clarity: number }): TunerReading;
  reset(): void;
}
```
**Initial state** (resolves plan-review "initial reading undefined" finding): `constructor` and
`reset()` MUST establish a defined `last` reading:
`{ hasSignal:false, stringIndex:0, note:strings[0], cents:0, displayCents:0, state:'ok', measuredHz:0 }`.
So even a first-frame low-clarity input has a well-defined frozen reading to return.

Update algorithm:
1. If `clarity < clarityThreshold` or `!Number.isFinite(hz)` or `hz <= 0`:
   `median.reset()` (drop stale samples so resume isn't polluted — resolves the median-gap NIT), then
   return a **frozen** reading = `{ ...last, hasSignal:false }` (stringIndex/cents/displayCents/state/measuredHz
   all UNCHANGED from the last reading). (AC-6) — note pitchy returns `[0,0]` (not NaN) when it can't
   find a pitch, which this gate catches via `clarity 0 < 0.9` and `hz <= 0`.
2. Else: `medianHz = median.push(hz)`.
3. Target: if `manualOverride != null` → `stringIndex = manualOverride` (never auto-switch, AC-4);
   else `sel = selectTarget(medianHz, strings, autoWindowCents)`; if `sel != null` set `stringIndex = sel`,
   else **keep previous `stringIndex`** (defaults to 0 on the very first valid frame if out of every window).
4. `cents = centsBetween(medianHz, strings[stringIndex].targetHz)`.
5. `state = hysteresis.update(cents)`.
6. Store & return `{ hasSignal:true, stringIndex, note:strings[stringIndex], cents, displayCents:Math.round(cents), state, measuredHz:medianHz }`.

AC-4 test: `setManualOverride(2)`, feed hz≈neighbor (e.g. A2 110 while override=D3 idx2) ⇒ stringIndex stays 2.
AC-6 test: (a) valid frame then `clarity<0.9` frame ⇒ `hasSignal:false` AND cents/stringIndex/measuredHz equal
the previous frame's; (b) first-ever frame with `clarity<0.9` ⇒ returns the defined initial frozen reading (no crash).

### 4.9 `audio/mic.ts` (AC-8, AC-9, AC-14)
```ts
export const AUDIO_CONSTRAINTS: MediaTrackConstraints =
  { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
export function micAvailable(nav?: Navigator): boolean; // !!navigator.mediaDevices?.getUserMedia
export class MicUnavailableError extends Error {}   // mediaDevices undefined
export class MicPermissionError extends Error {}    // NotAllowedError
// AC-9: resume() must be called SYNCHRONOUSLY inside the gesture, before any await.
export interface AudioHandle { ctx: AudioContext; ready: Promise<{ ctx: AudioContext; stream: MediaStream }>; }
export function acquireAudio(deps?: {
  makeContext?: () => AudioContext;
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
}): AudioHandle;
// impl: const ctx = makeContext(); ctx.resume(); const ready = getUserMedia({audio:AUDIO_CONSTRAINTS}).then(...)
```
Tests: (a) `acquireAudio` calls `ctx.resume` **synchronously** before the getUserMedia promise settles
(spy call order) — AC-9; (b) constraints object passed to getUserMedia has the 3 flags = false — AC-14;
(c) `micAvailable()` false when `navigator.mediaDevices===undefined` — AC-8.
**Call-site rule (plan-review NIT):** `Tuner.svelte`'s start handler MUST call `acquireAudio()` *synchronously*
(no `await` before it) so `ctx.resume()` runs inside the user gesture — the AC-9 chain only holds end-to-end
if the caller doesn't await anything first.

### 4.10 `audio/pipeline.ts` (thin; code-inspection + manual)
```ts
export class PitchPipeline {
  constructor(analyser: AnalyserNode, sampleRate: number, onFrame: (f: { hz: number; clarity: number }) => void);
  start(): void; // rAF loop: getFloatTimeDomainData -> pitchy.findPitch(buf, sampleRate) -> onFrame
  stop(): void;
}
export function makeAnalyser(ctx: AudioContext, src: AudioNode): AnalyserNode; // fftSize=4096, connect src
```
Uses pitchy: `PitchDetector.forFloat32Array(analyser.fftSize)`, `detector.findPitch(buf, sampleRate) -> [hz, clarity]`.
**CONFIRMED from `node_modules/pitchy@4.1.0/index.d.ts`** (setup agent): `static forFloat32Array(inputLength: number)`
+ `findPitch(input, sampleRate): [number, number]`. Signature correct as written. `inputLength` MUST equal the
buffer length passed to `findPitch` (= `analyser.fftSize`). When no pitch is found pitchy returns `[0, 0]`
(NOT NaN) — the engine's `clarity<0.9`/`hz<=0` gate handles it.

### 4.11 `metronome/scheduler.ts` (AC-10, AC-13)
```ts
export function clampBpm(v: number): number; // clamp to [40,240], round
export interface SchedulerDeps {
  now: () => number;                                   // AudioContext.currentTime (audio clock!)
  scheduleClick: (time: number, accent: boolean) => void; // oscillator.start(time) on audio clock
  setWaker: (cb: () => void, ms: number) => number;    // worker-backed; setTimeout fallback
  clearWaker: (id: number) => void;
}
export interface SchedulerOptions { beatsPerBar?: number; /*4*/ lookahead?: number; /*25ms*/ aheadTime?: number; /*0.1s*/ }
export class MetronomeScheduler {
  constructor(deps: SchedulerDeps, opts?: SchedulerOptions);
  setBpm(v: number): void; get bpm(): number;
  start(startTime?: number): void; stop(): void; get running(): boolean;
  onBeat(cb: (beat: number, time: number) => void): void; // 0=downbeat
}
```
Beat instants: `nextNote += 60/bpm`, scheduled while `nextNote < now() + aheadTime` (Chris Wilson two-clock).
DoD (AC-10): with an injected monotonic clock, drive 100 beats @120 BPM; captured beat times' inter-beat
interval SD **< 5 ms** (they are exact arithmetic on the audio clock ⇒ ~0). BPM clamp test: 39→40, 241→240.
**The waker is `setWaker` (worker); it is NEVER the beat time source — beat instants come only from `now()`+arithmetic.**

### 4.12 `metronome/worker.ts`
Web Worker: on `start(ms)` posts `{type:'tick'}` every `ms` via its own `setInterval` (waker only — allowed by the
NEVER rule, which bans setInterval as the *beat time source*, not as a waker). Main thread wires `setWaker` to it,
handles `visibilitychange` to stop/resync (D-21).

## 5. UI components (port `mockup.html` 1:1)

- **`app.css`**: copy the `:root` (light), `@media (prefers-color-scheme: dark)`, and
  `:root[data-theme="light|dark"]` token blocks verbatim, plus all component CSS. Toggle wins over OS.
- **App.svelte**: device card + topbar (brand, tuning `<select>`), bottom tabs (Stimmen/Metronom),
  theme toggle setting `document.documentElement[data-theme]` (AC-15). Owns active tuning + tab state.
- **Gauge.svelte**: rebuild the SVG gauge (arc, green ±5¢ zone, ticks, pendulum needle, hub) from the
  mockup `buildGauge()`. Needle rotates to `cents` (clamp ±50→±SPAN). Color = state. **Freeze**: when
  `hasSignal===false`, keep last needle transform (AC-6).
- **Headstock.svelte**: rebuild `buildHeadstock()` 3+3 layout; peg tap/Enter/Space = manual override
  (emits index → engine.setManualOverride). Selected peg lit (teal). Labels from active tuning.
- **Avatar.svelte**: 3 imported PNGs; show pose by `state` (low/ok/high).
- **Tuner.svelte**: owns `TunerEngine` + audio. Start gesture → `acquireAudio` (AC-9) → analyser →
  `PitchPipeline` → `engine.update` → reactive reading. Permission/feature errors → actionable message,
  no crash (AC-8). Status line ("hört zu…", "gestimmt ✓", tiefer/höher).
- **Metronome.svelte**: BPM number, 4 beat dots (`.beat`, first `.beat--down` — MUST be a distinct CSS
  class with a different computed color, AC-13), −/+ buttons + range [40,240], Start/Stop. Uses
  `MetronomeScheduler`; `AudioContext.resume()` on the start gesture.

**Component/UI test scope (re-homed per plan-review — jsdom has no CSS cascade or layout):**
- Automated in **jsdom** (DOM-structural only): AC-13 → exactly 4 `.beat` dots render, the first carries
  `.beat--down` and the others do NOT; BPM buttons/slider clamp to [40,240]. AC-15 → theme toggle flips
  `document.documentElement`'s `data-theme` attribute between `light`/`dark`.
- **Manual browser checklist** (README — the user runs these; jsdom cannot): AC-13 downbeat *computed color*
  differs from the other dots; AC-15 WCAG-AA contrast (axe-core) in light AND dark, and no horizontal scroll
  at 390×844 (`scrollWidth ≤ clientWidth`). Do NOT assert computed color / layout / stylesheet custom-property
  *values* in jsdom — they return `""`/`0` and would be false passes.

## 6. PWA (AC-11, AC-12)

- `vite-plugin-pwa`: `registerType:'autoUpdate'`, precache the app shell (Workbox `globPatterns`
  incl. js/css/html/png/svg) → fully offline (AC-11).
- Manifest: `name:"Ton-Gemetzel"`, `short_name`, `theme_color`/`background_color` (teal/light),
  `display:"standalone"`, `start_url:"."`, icons **192** & **512** (+ maskable). (AC-12)
- Generate icons (teal brand mark) into `public/`.

## 7. AC → module traceability

| AC | Where | Test kind |
|----|-------|-----------|
| AC-1 freqToNote | pitch/note.ts | unit |
| AC-2 in-tune state | pitch/state.ts | unit |
| AC-3 auto-select ±80¢ | pitch/select.ts | unit |
| AC-4 manual lock | pitch/engine.ts | unit |
| AC-5 smoothing+hysteresis | pitch/smooth.ts + engine.ts | unit |
| AC-6 clarity gate + freeze | pitch/engine.ts | unit |
| AC-7 tunings | tuning/tunings.ts | unit (data) |
| AC-8 no mediaDevices | audio/mic.ts | unit + manual E2E |
| AC-9 resume in gesture | audio/mic.ts (acquireAudio) | unit (spy) + manual iOS |
| AC-10 lookahead scheduler | metronome/scheduler.ts | unit (timing SD) + inspection |
| AC-11 offline | vite-plugin-pwa | manual (DevTools offline) |
| AC-12 installable | manifest/icons | manual (Lighthouse) |
| AC-13 BPM clamp + 4 dots + downbeat | scheduler.ts (clamp) + Metronome.svelte | unit (clamp) + jsdom component (4 dots, `.beat--down` present); **downbeat computed color → manual** |
| AC-14 constraints false | audio/mic.ts | unit |
| AC-15 mobile portrait + themes | app.css + App.svelte | jsdom component (`data-theme` flip); **contrast + no-h-scroll → manual** |

Browser/device ACs (8-E2E, 9-iOS, 11, 12, 15-contrast) → the **user runs manual tests**; we provide a
checklist in the README. Everything else is covered by automated Vitest.
