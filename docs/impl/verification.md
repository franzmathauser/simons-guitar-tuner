# Verification — Ton-Gemetzel (AC → evidence)

Final state: **`npm test` → 15 files / 99 tests pass · `npm run check` → 0 errors / 0 warnings ·
`npm run build` → success** (service worker + manifest + icons emitted). Code-review Dreiklang:
**PASS** (2 MAJOR + 3 MINOR + 1 NIT found and fixed, re-reviewed clean, plus a defense-in-depth
hardening).

| AC | Requirement | Evidence | Status |
|----|-------------|----------|--------|
| AC-1 | Hz → note/octave/cents (A4=440) | `src/lib/pitch/note.ts` · `note.test.ts` (82.41→E2/+0.07¢, 146.83→D3/−0.03¢, 329.63→E4/+0.01¢, 151→D3/+48.5¢, err<1¢) | ✅ auto |
| AC-2 | ±5¢ → in-tune state | `src/lib/pitch/state.ts` · `state.test.ts` ({−5,0,+5}→ok; {−6,+6}→not-ok) | ✅ auto |
| AC-3 | Auto-select nearest within ±80¢ | `src/lib/pitch/select.ts` · `select.test.ts` (in-window→index; 500Hz/90¢→null) | ✅ auto |
| AC-4 | Manual override locks the string | `src/lib/pitch/engine.ts` · `engine.test.ts` (override=2, feed A2 110→stays 2) | ✅ auto |
| AC-5 | Smoothing + hysteresis (anti-flicker) | `src/lib/pitch/smooth.ts` · `smooth.test.ts` (raw >2 vs hysteresis ≤2 transitions; opposite-sign snap; median) | ✅ auto |
| AC-6 | clarity<0.9/no signal → freeze needle | `engine.ts` (freeze `{...last,hasSignal:false}`, median.reset) + `Gauge.svelte` (holds angle) · `engine.test.ts` | ✅ auto |
| AC-7 | 4 tunings w/ correct target Hz | `src/lib/tuning/tunings.ts` · `tunings.test.ts` (all 24 freqs vs reference) | ✅ auto |
| AC-8 | No mic API / denied → message, no crash | `src/lib/audio/mic.ts` + `Tuner.svelte` (try/catch, typed errors) · `mic.test.ts`, `Tuner.test.ts` | ✅ auto + **M1** manual |
| AC-9 | `resume()` synchronous in gesture | `mic.ts` `acquireAudio` + `Tuner.svelte` start (no await before) · `mic.test.ts` (call-order spy) | ✅ auto + **M2** iOS manual |
| AC-10 | Web-Audio lookahead scheduler | `src/lib/metronome/scheduler.ts` (+ `worker.ts`) · `scheduler.test.ts` (100 beats@120, inter-beat **SD≈0ms<5ms**) | ✅ auto |
| AC-11 | Installed app works offline | `vite.config.ts` VitePWA precache; `dist/sw.js` + 22-entry app-shell precache | ⏳ **M3** manual (DevTools offline) |
| AC-12 | Installable PWA (valid manifest) | `dist/manifest.webmanifest` (name, 192+512+maskable icons, start_url, display=standalone) | ⏳ **M4** manual (Lighthouse) |
| AC-13 | BPM [40,240] + 4 dots + accented downbeat | `scheduler.ts` `clampBpm` + `Metronome.svelte` · `scheduler.test.ts`, `Metronome.test.ts` (4 dots, only first `.beat--down`, clamp) | ✅ auto (+ **M5** color) |
| AC-14 | gUM flags all `false` | `mic.ts` `AUDIO_CONSTRAINTS` · `mic.test.ts` (asserts 3 flags + forwarded object) | ✅ auto |
| AC-15 | Mobile portrait + light/dark | `src/app.css` tokens + `App.svelte` toggle · `App.test.ts` (`data-theme` flip) | ✅ auto (+ **M6** contrast/no-scroll) |

Legend: ✅ auto = proven by the automated Vitest suite. ⏳/manual = browser/device check in the
README **M1–M7** checklist (by design — jsdom has no Web Audio, layout, or CSS cascade).

## Boundaries (spec §Boundaries) — all upheld
- ALWAYS: HTTPS/localhost (documented), resume-on-gesture (Tuner + Metronome), gUM flags false, pitchy
  (0BSD/MIT), smoothed+hysteresis to UI. ✔
- NEVER: no `setInterval` as beat time source (audio-clock arithmetic; worker/setTimeout are wakers only),
  no FFT peak-picking (MPM on time-domain samples), no audio→server (zero network at runtime), no
  `ScriptProcessorNode`. ✔
- ASK-FIRST constants held at fixed values: clarity `0.9`, in-tune `±5¢`, auto `±80¢`. ✔

## Accepted (documented, no change)
- Gauge green arc ±6¢ vs threshold ±5¢, and "gestimmt" held to ±8¢ under hysteresis — intended
  anti-flicker (D-20), faithful to the approved mockup.
- 7 duplicate precache entries — identical revisions, Workbox dedupes at install; benign.
- Manifest `scope:"/"` + `start_url:"."` — benign at root deployment.

## Deviations from the mockup (justified)
- Added a Tuner **Start/Stop** button (mockup had a demo auto-tune sim) — required to gate the mic from a
  user gesture (AC-9).
- Theme toggle moved from the mockup's "nur Demo" panel into the topbar (AC-15).
- Corrected the flat-state status copy to "zu tief – höher stimmen ↑" (the mockup's wording gave the
  wrong tuning direction).
