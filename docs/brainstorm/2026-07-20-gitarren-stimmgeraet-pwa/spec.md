# Ton-Gemetzel — Gitarren-Stimmgerät (PWA)

> **Decision Journal:** Rationale, verworfene Alternativen und implizites Wissen
> stehen in `decisions.md` (gleiches Verzeichnis). Bei Unklarheit: **dort ZUERST nachsehen**,
> bevor eine eigene Interpretation gewählt wird.
>
> **Interaktives Mockup:** `mockup.html` (dieses Verzeichnis) — der Design-Referenzstand.
> Zuletzt veröffentlicht: https://claude.ai/code/artifact/fbfb19c1-048f-45e5-b793-899883df8e72

## Goal

„Ton-Gemetzel" ist eine als Progressive Web App umgesetzte **Gitarren-Stimm-App** für den mobilen
Einsatz. Sie erkennt den gespielten Ton automatisch über das Mikrofon, ordnet ihn der passenden
Saite der gewählten Stimmung zu und zeigt die Abweichung über eine **analoge Zeiger-Skala**
(zu tief ↔ gestimmt ↔ zu hoch). Ein reagierender **Cartoon-Avatar** und ein hervorgehobener
**Gitarrenkopf-Wirbel** machen den Stimmvorgang anschaulich. Zusätzlich enthält die App ein
schlankes **Viertelnoten-Metronom** mit einstellbarem Tempo. Ziel ist ein zuverlässiges,
vollständig offline lauffähiges persönliches Werkzeug — funktional vor Hochglanz.

## Context

- **Auslöser:** Wunsch nach einem persönlichen Stimmgerät mit eigener, verspielter Optik
  (Avatar, Gitarrenkopf, Zeiger-Skala) statt einer generischen Tuner-App.
- **Rahmen (aus Decision Journal):** PWA (F-1); Mobile-first Portrait (D-2); persönliches,
  funktionales Tool (D-4); Standard-Stimmung + gängige Alt-Tunings (D-1/D-15); Auto-Erkennung
  mit manuellem Override (D-3).
- **Technische Basis (evidenzbasiert, F-9…F-16):** Tonhöhenerkennung per McLeod-Pitch-Method
  über `pitchy` (D-7); Audio-Analyse per AnalyserNode + rAF in v1, AudioWorklet als Upgrade-Pfad
  (D-6); Metronom per Web-Audio-Lookahead-Scheduler (D-8); PWA/Offline per vite-plugin-pwa +
  Service Worker (D-9).
- **Stack:** Svelte 5 + Vite + vite-plugin-pwa (D-5).
- **Design:** Palette „Clean & Hell" mit Teal-Akzent (D-16), Headstock mit montierten Wirbeln
  (D-17) — im Mockup bestätigt (F-19).
- **Prozess:** Das interaktive Mockup (`mockup.html`) wurde vor der Implementierung erstellt und
  vom Entscheider abgenommen — erfüllt F-7, Abnahme dokumentiert in F-19.

## Design

### 1. Tech-Stack & Struktur
- **Svelte 5 + Vite**, PWA über **vite-plugin-pwa** (Workbox) (D-5, D-9).
- **Bibliothek:** `pitchy` 4.x (MPM, permissive Lizenz, zero-dep) (D-7).
- Trennung in Module: `audio/` (Mic-Zugriff, Pipeline), `pitch/` (pitchy-Wrapper, Note-Mapping,
  Glättung), `tuning/` (Datenmodell), `metronome/` (Scheduler im Web Worker), `ui/` (Svelte-Komponenten).
  *(Empfohlene Struktur, abgeleitet aus D-5 — siehe D-24; nicht normativ.)*

### 2. Audio-Pipeline (Tuner)
```
🎤 getUserMedia(AGC/NS/EC=false)  →  AudioContext  →  AnalyserNode (Float32, 4096)
    →  rAF-Loop  →  pitchy MPM  →  { hz, clarity }
    →  clarity-Gate (≥0.9)  →  Median-Glättung  →  Hz → Note + Cent (A4=440)
    →  Auto-Saitenwahl (nächster Zielton im ±80-¢-Fenster, außer manueller Override)
    →  UI-State { note, cents(geglättet+Hysterese), zustand: low|ok|high }
```
- Analysefenster **4096 Samples @ 44,1/48 kHz** (F-11); nicht heruntersampeln.
- **Kammerton A4 = 440 Hz** fix (D-14).

### 3. Tuning-Datenmodell
- Eine Stimmung = geordnete Liste von 6 Saiten `{ note, accidental, octave, targetHz }` (tief→hoch).
  *(Feld-Schema begründet in D-15/D-24: Vorzeichen für E♭, Oktaven für E2…E4.)*
- Enthaltene Stimmungen (D-15): **Standard** E2 A2 D3 G3 B3 E4 · **Drop D** · **½-Ton tiefer (E♭)** ·
  **Open G**. Auswahl über Header-Dropdown.

### 4. UI — Tuner-Screen (Portrait, D-11)
- **Kopf:** App-Name „Ton-Gemetzel" + Stimmungs-Dropdown.
- **Notenanzeige:** großer Notenname (+Vorzeichen/Oktave), Zielfrequenz, **Cent-Abweichung**,
  gemessene Frequenz — Zustandsfarbe.
- **Zeiger-Skala (Held):** horizontale/pendelnde Skala, grüne Mittelzone (±5 ¢), ♭ links / ♯ rechts;
  Nadel schwingt zur Abweichung, Farbe = Zustand.
- **Avatar (rechts, F-4):** `low` (erschrocken, zu tief) · `ok` (neutral, gestimmt) ·
  `high` (Ohren zu, zu hoch).
- **Gitarrenkopf (D-17):** 3+3-Headstock mit 6 montierten Wirbeln; der aktuell selektierte Wirbel
  leuchtet (Teal). **Antippen = manueller Override** (D-3).

### 5. UI — Metronom-Screen (D-13)
- Große BPM-Zahl, **4 Beat-Punkte** (4/4, Viertel) mit akzentuiertem Downbeat, −/+ & Slider
  (40–240 BPM), Start/Stop. Klick über Web Audio.

### 6. Navigation
- **Bottom-Tabs „Stimmen" / „Metronom"** (D-10).

### 7. Zustandslogik (Cent → Zustand → Avatar/Farbe)
- `|cents| ≤ 5` → **ok** (grün, avatar_ok) · `< −5` → **low** (blau, avatar_low) ·
  `> +5` → **high** (rot, avatar_high) (D-12).
- Vor der UI-Ausgabe: **Glättung + Hysterese** gegen Flackern an den Grenzen (D-20).

### 8. PWA / Offline
- Manifest (Name, Icons 192/512, `start_url`, `display`) + Service-Worker-Precaching der
  App-Shell → **vollständig offline** (D-9/D-22). Kein Netz zur Laufzeit.

## Acceptance Criteria

> RFC-2119: SHALL/SHALL NOT = verpflichtend, SHOULD = empfohlen, MAY = optional.
> Verhaltens-Kriterien in EARS-Form. Jede DoD ist ein ausführbarer/beobachtbarer Pass/Fail-Check.

- **AC-1** (Ubiquitous): The system SHALL map a detected fundamental frequency to note name,
  octave and cent deviation relative to A4 = 440 Hz.
  DoD: Unit-Test `freqToNote()`: 82.41→E2/0¢, 146.83→D3/0¢, 329.63→E4/0¢, 151.0→D3/+~48¢
  (Assert Cent-Fehler < 1 ¢). `npm test` grün.
- **AC-2** (Event): When the measured pitch is within ±5 cents of the active target, the system
  SHALL display the in-tune state (needle centered in the green zone, avatar `ok`, status „gestimmt").
  DoD: Test: cents ∈ {−5,0,+5} ⇒ state==='ok'; cents ∈ {−6,+6} ⇒ state≠'ok'.
- **AC-3** (Event): When a valid pitch is detected and no manual override is active, the system
  SHALL auto-select the nearest tuning target that lies within ±80 cents of the measurement. (D-18)
  DoD: Test `selectTarget(hz)` liefert korrekte Saite für Repräsentativ-Frequenzen und `null`
  außerhalb des Fensters.
- **AC-4** (State): While a string is manually selected (peg tapped), the system SHALL NOT
  auto-switch the selected string. (D-3, D-18)
  DoD: Test: manual=idx setzen, Frequenz nahe Nachbarsaite einspeisen ⇒ ausgewählte Saite bleibt idx.
- **AC-5** (Unwanted): If the smoothed cent value oscillates around a state boundary, the system
  SHALL apply smoothing + hysteresis so the avatar/color state toggles no more than once per
  configurable interval. (D-20)
  DoD: Test: verrauschte Cent-Folge um ±5 ¢ einspeisen ⇒ Anzahl Zustandswechsel ≤ definierte Schwelle;
  `smooth()`-Funktion unit-getestet.
- **AC-6** (Unwanted): If pitch clarity < 0.9 or no signal is present, the system SHALL show a
  „kein Ton / spiel eine Saite"-Zustand and SHALL freeze the needle. (D-18, D-24)
  DoD: Test: clarity < 0.9 ⇒ Status = no-signal, Nadelposition unverändert gegenüber vorherigem Frame.
- **AC-7** (Ubiquitous): The system SHALL provide the tunings Standard EADGBE, Drop D,
  Half-Step-Down (E♭) and Open G, selectable in the header. (D-15)
  DoD: Daten-Test: jede Stimmung hat 6 Saiten mit korrekten Ziel-Hz (Assert gegen Referenztabelle).
- **AC-8** (Unwanted): If microphone permission is denied or `navigator.mediaDevices` is
  unavailable, the system SHALL display an actionable message and SHALL NOT crash. (D-19)
  DoD: E2E: Permission verweigern ⇒ sichtbare Handlungsanweisung; Unit-Branch für `mediaDevices===undefined` getestet.
- **AC-9** (Event): When the user activates the tuner via the start gesture, the system SHALL call
  `AudioContext.resume()` within that gesture handler. (D-19, F-14)
  DoD: Unit-Test spioniert `AudioContext.resume` und prüft, dass es **synchron innerhalb** des
  Klick-/Start-Handlers aufgerufen wird (nicht in einem späteren async-Callback); beobachtbar: Tuner startet auf iOS Safari.
- **AC-10** (Ubiquitous): The metronome SHALL schedule beat audio via a Web-Audio lookahead
  scheduler (events on `AudioContext.currentTime`), NOT via setInterval-timed audio. (D-8, D-21)
  DoD: Code-Inspektion (Events auf `AudioContext.currentTime`, kein setInterval-getaktetes Audio) +
  Timing-Test: Standardabweichung des Beat-Abstands < 5 ms über 100 Beats @ 120 BPM
  (operative Zielgröße, MAY angepasst — D-24).
- **AC-11** (Event): When the installed app is launched with the network disabled, the app SHALL
  load and the tuner SHALL function. (D-9, D-22)
  DoD: Offline-Test (DevTools „Offline" / Playwright offline): App-Shell lädt, Mic-Pipeline startet.
- **AC-12** (Ubiquitous): The app SHALL be installable as a PWA (valid manifest served over HTTPS). (F-15)
  DoD: Lighthouse-PWA-Installability-Audit „passes"; Manifest enthält name, 192- & 512-Icon,
  start_url, display.
- **AC-13** (Ubiquitous): The metronome SHALL allow BPM in [40, 240] and visualize a 4/4 bar as
  four dots with an accented downbeat. (D-13)
  DoD: UI-Test: BPM klemmt bei 40/240; genau 4 Beat-Punkte gerendert; der erste Punkt (Downbeat)
  trägt eine eigene CSS-Klasse und hat eine andere computed color als die übrigen drei (assert).
- **AC-14** (Ubiquitous): The system SHALL request the microphone with `echoCancellation`,
  `noiseSuppression` and `autoGainControl` set to `false`. (F-13)
  DoD: Test/Code-Inspektion: getUserMedia-Constraints-Objekt enthält die drei Flags = false.
- **AC-15** (Ubiquitous): The UI SHALL render mobile-first in portrait and SHALL support both
  light and dark themes. (D-2, D-16)
  DoD: Automatisierter Kontrast-Check (z. B. axe-core) verifiziert Text/Hintergrund ≥ 4.5:1 (WCAG AA)
  in Light UND Dark; Test prüft, dass der Theme-Toggle `data-theme` setzt und die CSS-Tokens in beide
  Richtungen wechseln; kein horizontaler Scroll bei 390×844 (assert `scrollWidth ≤ clientWidth`).

## Boundaries

**ALWAYS**
- App nur über **HTTPS** (oder localhost) ausliefern — getUserMedia benötigt Secure Context. (D-19/F-14)
- AudioContext **nur aus einer User-Geste** starten/`resume()`. (D-19/F-14)
- getUserMedia mit **echoCancellation/noiseSuppression/autoGainControl = false**. (F-13)
- Nur **permissive Lizenzen** verwenden (pitchy 0BSD/MIT). (D-7/F-10)
- Frequenz-/Zustandswerte **geglättet + mit Hysterese** an die UI geben. (D-20)

**ASK FIRST** (stoppen und mit Entscheider abstimmen)
- Änderung der Kern-Schwellen: clarity 0.9, In-Tune ±5 ¢, Auto-Wahl-Fenster ±80 ¢. (D-12/D-18)
- Wechsel des Pitch-Algorithmus/der Bibliothek weg von pitchy/MPM. (D-7)
- Erweiterung um Instrumente/Stimmungen über D-15 hinaus. (D-1)

**NEVER**
- Reines `setInterval`/`setTimeout` als Zeitquelle für die **Beat-Zeitpunkte** des Metronoms. (D-8/D-21)
- **FFT-Peak-Picking** als primäre Tonhöhenerkennung. (D-7/F-9)
- **Audio-/Frequenzdaten an externe Server** senden (Offline-/Datenschutz-Prinzip).
- **ScriptProcessorNode** (deprecated) neu einführen. (F-12)

**Dokumentierte bekannte Einschränkung**
- iOS entfernt PWA-Caches nach ~7 Tagen Nichtnutzung (F-14/D-22) — nicht vollständig behebbar,
  im README dokumentieren.

## Out of Scope (v1)

- Konfigurierbarer Kammerton (z. B. 432 Hz). (D-14)
- Multi-Instrument (Bass, Ukulele) und Custom-Tuning-Editor. (D-1)
- Freier chromatischer Tuner-Modus (jede beliebige Note).
- Metronom-Erweiterungen: andere Taktarten (3/4, 6/8), Achtel/Triolen, Tap-Tempo,
  Klang-/Akzent-Auswahl.
- Produktions-Audio-Pfad per **AudioWorklet** (dokumentierter Upgrade-Pfad, D-6 — nicht v1).
- Stimm-Fortschrittsanzeige (Häkchen pro Saite) und Onboarding/Hilfe-Overlay.
- Konten, Cloud-Sync, Teilen.
