# Ton-Gemetzel — Gitarren-Stimmgerät & Metronom (PWA)

A personal, fully-offline **guitar tuner** with an analog pendulum-needle scale, a reacting
cartoon avatar, a lit guitar-headstock peg, and a lean quarter-note **metronome** — built as an
installable Progressive Web App.

- Automatic note detection via the microphone (McLeod Pitch Method, `pitchy`).
- Analog deviation gauge (♭ too low ↔ in tune ↔ too high ♯), state-colored.
- Avatar poses: startled (too low) · neutral (in tune) · ears-covered (too high).
- Tunings: **Standard EADGBE · Drop D · ½-Step-Down (E♭) · Open G**, plus manual string override.
- Metronome: 40–240 BPM, 4/4 with accented downbeat, sample-accurate Web-Audio scheduling.
- **Works completely offline** after install. No audio ever leaves the device.

> Design reference: `docs/brainstorm/2026-07-20-gitarren-stimmgeraet-pwa/mockup.html` (approved).
> Full spec + decisions: same folder. Implementation architecture & module contracts:
> `docs/impl/architecture.md`.

## Stack

Svelte 5 (runes) · Vite · TypeScript · `pitchy` 4.x (MPM) · `vite-plugin-pwa` (Workbox) ·
Vitest + @testing-library/svelte. A4 = 440 Hz. All dependencies permissive-licensed.

## Commands

```bash
npm install          # install dependencies

npm run dev          # dev server at http://localhost:5173/simons-guitar-tuner/  (localhost = secure context → mic works)
npm run build        # production build into dist/ (emits service worker + manifest)
npm run preview      # serve the production build locally (also under /simons-guitar-tuner/)

npm test             # run the full unit/component test suite (Vitest, one shot)
npm run test:watch   # watch mode
npm run check        # svelte-check (type + template check, must be 0 errors)
```

### Microphone requires a secure context

`getUserMedia` only works over **HTTPS** or **`localhost`**. So:

- **Desktop:** `npm run dev` (or `npm run preview`) on `http://localhost:…` works out of the box.
- **On a phone / real device:** a plain LAN address (`http://192.168.x.x`) is **not** a secure
  context and the mic will be blocked. Use one of:
  - a quick HTTPS tunnel (e.g. `cloudflared tunnel --url http://localhost:5173` or `ngrok http 5173`), or
  - add `@vitejs/plugin-basic-ssl` to serve dev/preview over self-signed HTTPS, or
  - deploy `dist/` to any static HTTPS host (Netlify/Vercel/GitHub Pages/…).
- **iOS:** the mic works in a **Safari** tab and in a **home-screen–installed** PWA (since iOS 13.4),
  but **not** in third-party iOS browsers (Chrome/Firefox/Edge use WKWebView, which blocks it).

## Deployment (GitHub Pages)

The app is a static client-side PWA, so it deploys as a plain folder of files over HTTPS —
which also satisfies the mic's secure-context requirement. Live URL:

> **https://franzmathauser.github.io/simons-guitar-tuner/**

Hosting is automated by `.github/workflows/deploy.yml`: every push to `main` runs `npm ci`,
`npm run build`, and publishes `dist/` to Pages (no `gh-pages` branch). One-time repo setup:
**Settings → Pages → Build and deployment → Source = "GitHub Actions"**.

Because a project site is served from the `/simons-guitar-tuner/` subpath, `vite.config.ts` sets
`base` for the production build. **If you rename the repo, update `base` to match** — otherwise the
built asset/manifest/service-worker URLs 404 and the app loads blank. (A user site at
`franzmathauser.github.io` or a custom domain would be served at `/`, so `base` could be `/` there.)

## Architecture in one glance

Pure, framework-free logic under `src/lib/` (unit-tested in isolation), thin Web-Audio + Svelte
layers on top:

```
src/lib/tuning/     tuning data model + the 4 tunings
src/lib/pitch/      cents · freqToNote · state · selectTarget · smoothing+hysteresis · TunerEngine
src/lib/audio/      mic (constraints/permission/gesture-resume) · analyser+rAF+pitchy pipeline
src/lib/metronome/  two-clock lookahead scheduler + Web-Worker waker
src/components/     App · Tuner · Metronome · Gauge · Headstock · Avatar (Svelte 5)
```

Data flow: mic → AnalyserNode(4096) → pitchy → `{hz, clarity}` → `TunerEngine.update()`
(clarity gate ≥ 0.9, median smoothing, ±80¢ auto string-select or manual lock, hysteresis state) →
reactive UI. See `docs/impl/architecture.md` for the exact contracts and the AC→module traceability.

## Testing

`npm test` covers all deterministic logic automatically (97 tests): note mapping, in-tune state,
auto string selection, manual-override lock, smoothing + hysteresis (incl. anti-flicker and the
opposite-sign snap), clarity gate + needle freeze, the 4 tunings' frequencies, mic constraints
(`echoCancellation/noiseSuppression/autoGainControl = false`), the synchronous `AudioContext.resume()`
in the start gesture, the metronome timing (inter-beat SD ≈ 0 ms over 100 beats @120 BPM), BPM clamp,
the 4 beat dots with a distinct downbeat class, the mic-unavailable error path, and the theme toggle.

Things that need a **real browser/device** are listed below for you to verify manually — jsdom has
no CSS cascade, layout, or Web-Audio, so those assertions can't be trusted in the automated suite.

## Manual test checklist (browser / device)

Run these once against `npm run preview` (or the installed PWA). Each maps to an acceptance criterion.

| # | AC | Steps | Expected |
|---|----|-------|----------|
| M1 | AC-8 | Open the tuner, tap **Start**, **deny** the mic permission (or open in a context with no mic). | A clear, actionable message appears; the app does not crash or go blank. |
| M2 | AC-9 | On **iOS Safari** (tab or installed PWA), tap **Start**. | The tuner activates and reacts to played notes (proves `AudioContext.resume()` ran inside the gesture; iOS starts contexts suspended). |
| M3 | AC-11 | `npm run build` → `npm run preview`, load once, then set DevTools **Network: Offline** (or disable Wi-Fi on the installed PWA) and reload. | App shell loads and the tuner still starts and detects pitch. |
| M4 | AC-12 | Run **Lighthouse → PWA** (or Chrome's install icon) on the previewed/HTTPS build. | "Installable" passes; manifest has name, 192 + 512 icons, `start_url`, `display`. |
| M5 | AC-13 | Open the Metronome tab. | Exactly 4 beat dots; the **first (downbeat)** is visibly a different color from the other three while running. |
| M6 | AC-15 | View at **390×844** (iPhone-ish) in both light and dark; toggle the theme button. | No horizontal scroll; text/background contrast ≥ 4.5:1 (run **axe-core**) in **both** themes; toggle flips the whole palette. |
| M7 | — | Play each string in each tuning; deliberately mistune. | Needle swings, color + avatar + status change (blue/startled low, green/ok, red/ears-covered high); the lit peg follows the played string; tapping a peg locks that string. |

## Known limitation

- **iOS evicts PWA caches after ~7 days of non-use** (WebKit storage policy). If the installed app
  isn't opened for about a week, iOS may clear its offline cache and it will need one online load to
  re-cache. This is a platform behavior and is not fully avoidable (documented per F-14 / D-22).

## Privacy

All audio analysis happens locally in the browser. Nothing is recorded, uploaded, or sent to any
server — at runtime the app makes no network requests at all.
