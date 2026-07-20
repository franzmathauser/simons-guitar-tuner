# Decision Journal — Gitarren-Stimmgerät (PWA)

## Established Facts

F-1: [verified] Die App ist ein Stimmgerät für (akustische/elektrische) Gitarren, umgesetzt als PWA. (Source: User-Request 2026-07-20)

F-2: [verified] Kern-UI: Eine horizontale Linie mit einem Zeiger/Pendel (wie ein Geigerzähler). Zeiger links = Ton zu tief, Zeiger rechts = zu hoch, Zeiger mittig = korrekter Frequenzbereich. (Source: User-Request)

F-3: [verified] Die Zielnote wird automatisch aus dem gespielten Ton ermittelt: Liegt der gespielte Ton im Frequenzbereich z.B. der D-Saite, wird D für den Stimmvorgang selektiert. (Source: User-Request)

F-4: [verified] Ein Avatar (bereitgestelltes Bild, 3 Posen) symbolisiert die Stimmung: zu tief = Augen aufgerissen + offener Mund; korrekt = neutral/lächelnd; zu hoch = Gesicht verzogen + hält sich die Ohren zu. (Source: User-Request + bereitgestelltes Bild)

F-5: [verified] Der Gitarrenkopf soll dargestellt werden; die Stimmschraube (Mechanik) der aktuell zu stimmenden Saite ist hervorgehoben. (Source: User-Request)

F-6: [verified] Ein kleines Metronom ist gewünscht: nur Viertelnoten, einstellbare BPM, Takt visualisiert (z.B. Viertelnoten-Symbole oder Punkte). (Source: User-Request)

F-7: [verified] Vor der Implementierung soll mit "Claude design" ein Mockup erstellt werden. (Source: User-Request)

F-8: [verified] Das gelieferte Avatar-Bild (1408×768) enthält 3 Posen nebeneinander und wurde in 3 Einzelzustände zerlegt (avatar_low = erschrocken/zu tief, avatar_ok = neutral/korrekt, avatar_high = Ohren-zuhaltend/zu hoch). Posen-Reihenfolge links→mitte→rechts bestätigt visuell. (Source: eigene Bildverarbeitung + visuelle Prüfung)

<!-- Research-Fakten aus research/pitch-detection-and-pwa.md (2026-07-20), Quellen dort inline zitiert -->

F-9: [verified] Für die tiefen Gitarren-Grundtöne (E2 = 82,41 Hz) sind Zeitbereichs-Verfahren (McLeod MPM / YIN, beides Autokorrelations-Verfeinerungen) nötig. Reines FFT-Peak-Picking erreicht dort keine Cent-Genauigkeit: FFT-Bin-Auflösung = fs/N; selbst 8192-Punkt-FFT @44,1kHz = 5,4 Hz/Bin ≈ ein ganzer Halbton bei 82 Hz, während ±5 Cent ≈ 0,24 Hz verlangen. Zeitbereichsverfahren finden die Periode direkt + interpolieren sub-sample. (Source: research §1)

F-10: [verified] Empfohlene Bibliothek: pitchy 4.x — implementiert MPM, liefert (Tonhöhe + clarity 0–1, nutzbar als "Ton vorhanden?"-Gate), aktiv gepflegt (2024), permissive Lizenz (0BSD/MIT), zero-dependency reines ESM auf Float32Array. Alternativen sind ausgeschieden: pitchfinder & aubiojs sind GPL (Copyleft-Falle für ausgelieferte App); ml5 CREPE wurde aus aktuellem ml5 entfernt + Modell verschollen. (Source: research §1)

F-11: [verified] Analysefenster: ~4096 Samples @44,1/48 kHz (~93 ms ≈ 7–8 Perioden von E2) als robuster Default; ≥2048 (~46 ms) als Minimum. Nicht heruntersampeln. Cent-Präzision kommt aus Sub-Sample-Perioden-Interpolation, nicht aus größerem Fenster. (Source: research §1)

F-12: [verified] AudioWorklet ist die empfohlene Echtzeit-API (isolierter Audio-Thread; Baseline: Chrome 66+, Firefox 76+, Safari 14.1+). ScriptProcessorNode ist deprecated. AnalyserNode.getFloatTimeDomainData + requestAnimationFrame ist für einen MVP ausreichend (Tuner braucht nur ~30–60 Hz Update-Rate). (Source: research §2)

F-13: [verified] getUserMedia-Constraints echoCancellation / noiseSuppression / autoGainControl sollten für Tonhöhenanalyse auf false gesetzt werden (Defaults sind true; sie verändern Amplitude/Spektrum). Ehrlichkeits-Hinweis: MDN dokumentiert die Signalveränderung, spricht aber keine explizite "für Analyse abschalten"-Empfehlung aus — das ist gut belegter Praktiker-Konsens (addpipe), der aus dem MDN-Verhalten folgt. (Source: research §2)

F-14: [verified] getUserMedia erfordert Secure Context (HTTPS; localhost erlaubt). Installierte Standalone-PWA auf iOS hat Mikrofon-Zugriff seit iOS 13.4 (2020) — aber nur über Safari/WebKit, NICHT in WKWebView-Drittbrowsern. AudioContext startet auf iOS "suspended" → muss per resume() aus einer User-Geste (Start-Button) aktiviert werden. iOS ~7-Tage-Cache-Eviction beachten. (Source: research §3)

F-15: [verified] PWA-Installierbarkeit = Web-App-Manifest (Icons 192px + 512px, start_url, display) über HTTPS + <link rel="manifest">. Service Worker ist NICHT für die Installierbarkeit nötig, ermöglicht aber Vollständig-Offline. Ein Tuner kann vollständig offline laufen (nur Mikrofon + lokale Berechnung, kein Netz zur Laufzeit). (Source: research §3)

F-16: [verified] Metronom braucht einen Web-Audio-Lookahead-Scheduler (Chris Wilson "A Tale of Two Clocks": ~25 ms Timer als Waker, ~100 ms Vorausplanung, Events auf AudioContext.currentTime; Scheduler-Loop idealerweise im Web Worker). setInterval/setTimeout allein driftet (durch Layout/GC um zig ms). (Source: research §4)

<!-- Mid-Session-Fakten -->

F-17: [verified] App-Name: "Ton-Gemetzel". (Source: User-Request 2026-07-20, mid-session)

F-18: [verified] User-Feedback zum Mockup v1: (a) die warm-beige/Messing-Palette gefällt nicht; (b) die Headstock-Mechaniken wirken vom Hals losgelöst / "abgerissen" (Verbindung unsichtbar) — muss sichtbar am Hals sitzen. Look-&-Feel-Grundrichtung (Studio-Gerät, Pendel-Skala, Avatar an der Seite) ist ok. Avatar-Größe/Platzierung ok. (Source: User-Feedback + Screenshot mid-session)

F-19: [verified] User hat das Mockup v2 (Palette "Clean & Hell" + montierter Headstock) angenommen: Farben "passt", Headstock "sieht gut aus". Avatar-Größe/Platzierung bereits ok (F-18). (Source: User-Feedback 2026-07-20)

## Decisions & Rationale

D-1: [accepted] **Umfang: Standard-Stimmung EADGBE + gängige alternative Tunings.**
- Evaluated: Nur Standard EADGBE / Standard + Alt-Tunings / Multi-Instrument.
- Rejected "Nur Standard": zu eng, alternative Tunings sind für Gitarristen alltäglich.
- Rejected "Multi-Instrument": zu großer Umfang für ein persönliches Tool (siehe D-4), YAGNI.
- Chosen because: Deckt reale Nutzung ab, ohne die Komplexität mehrerer Instrumente. Datenmodell muss Tunings als Liste von (Saite → Zielfrequenz) abbilden.

D-2: [accepted] **Zielgerät: Mobile-first, Hochformat (Portrait).** (resolves Q-2)
- Evaluated: Mobile-first Portrait / Desktop-Tablet Querformat / Responsive für beides.
- Chosen because: Typischer Use-Case — Smartphone in der Hand/am Ständer, während die Gitarre gehalten wird. Layout und Mockup werden für Portrait entworfen.

D-3: [accepted] **Saitenwahl: Auto-Erkennung als Standard + manueller Override (Antippen einer Saite).**
- Evaluated: Nur Auto-Erkennung / Auto + manueller Override.
- Rejected "Nur Auto": Stark verstimmte Saiten können näher an einer Nachbarsaite liegen und falsch erkannt werden.
- Chosen because: Auto deckt den Normalfall ab, manueller Override ist die Absicherung (mitigiert späteres Fehlerkennungs-Risiko im Pre-Mortem).

D-4: [accepted] **Anspruch: Persönliches, funktionales Tool (schlank, zuverlässig) — kein App-Store-Politur-Level.**
- Evaluated: Persönliches funktionales Tool / Polierte teilbare App.
- Chosen because: Steuert Tech-Wahl (schlanker Stack, kein schweres Framework nötig) und Design-Aufwand (sauber, aber ohne Onboarding/aufwändige Animationen).

D-5: [accepted] **Frontend-Stack: Svelte 5 + Vite + vite-plugin-pwa.**
- Evaluated: Svelte 5+Vite / Vanilla TS+Vite / React+Vite (alle mit vite-plugin-pwa).
- Rejected Vanilla TS: zu viel manuelle DOM-Verdrahtung für die reaktive UI → Boilerplate/Fehlerfläche.
- Rejected React: schwererer Runtime + Render-Modell schlecht für 60-fps-Audio-Updates (Refs/Canvas außerhalb State nötig).
- Chosen because: Compiler-Reaktivität, kleinstes Bundle, ergonomisch für dauernd aktualisierte UI (Zeiger/Avatar/Metronom), erstklassige PWA-Integration. Bester Fit zu D-4.

D-6: [accepted] **Audio-Pfad v1: AnalyserNode.getFloatTimeDomainData + requestAnimationFrame → pitchy. AudioWorklet als dokumentierter Upgrade-Pfad.** (grounded in F-12)
- Evaluated: AnalyserNode+rAF (MVP) / AudioWorklet von Anfang an.
- Rejected AudioWorklet-first: deutlich mehr Verdrahtung (Worklet-Modul, Message-Port, Bundling) — Overkill für v1; Update ist ein lokaler Austausch bei gleichem MPM-Algorithmus.
- Chosen because: simpel, erprobt (Chris Wilson), für Tuner-Update-Raten ausreichend.

D-7: [accepted] **Pitch-Detection: McLeod Pitch Method via pitchy 4.x.** (grounded in F-9, F-10)
- Evaluated: MPM/pitchy / YIN / FFT-Peak-Picking / pitchfinder / aubiojs / ml5 CREPE.
- Rejected FFT-Peak-Picking: keine Cent-Genauigkeit bei 82 Hz (F-9).
- Rejected pitchfinder & aubiojs: GPL/Copyleft-Falle. Rejected ml5 CREPE: aus aktuellem ml5 entfernt, Modell verschollen, zu schwer.
- Chosen because: cent-genau bei tiefen Grundtönen, permissive Lizenz, zero-dep, clarity-Gate inklusive.

D-8: [accepted] **Metronom: Web-Audio-Lookahead-Scheduler (Chris Wilson "Two Clocks"), Scheduler-Loop idealerweise im Web Worker.** (grounded in F-16)
- Chosen because: driftfreies, sample-genaues Timing; setInterval allein driftet hörbar.

D-9: [accepted] **PWA: vite-plugin-pwa (Workbox) mit App-Shell-Precaching → vollständig offline lauffähig; Manifest mit 192/512-Icons.** (grounded in F-15)
- Chosen because: Tuner braucht kein Netz zur Laufzeit; Offline-Fähigkeit ist mit geringem Aufwand mitnehmbar.

<!-- Design-Entscheidungen (Schritt 5) -->

D-10: [accepted] **Navigation: Bottom-Tabs "Stimmen" / "Metronom" (zwei getrennte Screens).**
- Evaluated: Bottom-Tabs / ein durchscrollender Screen / Metronom als Panel im Tuner.
- Chosen because: hält den Tuner-Screen aufgeräumt; klares Mobile-Muster; jede Funktion hat vollen Platz.

D-11: [accepted] **Tuner-Layout (Portrait):** oben Notenanzeige (Notenname groß + Zielfrequenz + Cent-Abweichung + gemessene Hz), Mitte horizontale Gauge (Zeiger, grüne Mittelzone, ♭ links / ♯ rechts) mit Avatar rechts daneben ("an der Seite"), darunter Gitarrenkopf (3+3-Headstock) mit 6 Pegs; selektierter Peg leuchtet; Peg antippbar = manueller Override (D-3).
- Chosen because: bildet die Nutzer-Vorstellung 1:1 ab (Linie/Zeiger mittig, Avatar an der Seite, Gitarrenkopf sichtbar).

D-12: [accepted] **In-Tune-Toleranz: ±5 Cent → grün + avatar_ok. < −5 ¢ (zu tief) → avatar_low (erschrocken). > +5 ¢ (zu hoch) → avatar_high (Ohren zu).** (resolves Q-4)
- Chosen because: ±5 ¢ ist musikalisch nicht mehr hörbar verstimmt, aber realistisch erreichbar (nicht frustrierend eng). Avatar-Mapping folgt F-4.

D-13: [accepted] **Metronom-Screen:** große BPM-Zahl, 4 Beat-Punkte (4/4, Viertelnoten) mit akzentuiertem Downbeat, −/+ und Slider für BPM (Bereich 40–240), Start/Stop-Button.
- Chosen because: erfüllt F-6 (Viertel, einstellbare BPM, Takt als Punkte visualisiert) ohne Overhead.

D-14: [accepted] **Kammerton A4 = 440 Hz fix in v1.** (resolves Q-3)
- Evaluated: fix 440 / konfigurierbar.
- Chosen because: Standard, hält v1 schlank (D-4). Konfigurierbarer Kammerton ist Out-of-Scope-Kandidat.

D-15: [accepted] **Tuning-Auswahl als Header-Dropdown:** Standard EADGBE (Default) + Drop D + Half-Step Down (E♭) + Open G. (setzt D-1 um)
- Chosen because: deckt gängige Alt-Tunings ab; Dropdown ist platzsparend im Header.

<!-- Design-Iteration nach Mockup-v1-Feedback (F-18) -->

D-16: [accepted] **Farbpalette "Clean & Hell":** kühles Hellgrau `#eef2f7` Hintergrund, weiße Geräte-Karte, Akzent Petrol/Teal (`#0d9488` hell / `#2dd4bf` dark); Zustands-Semantik gestimmt `#16a34a` / zu tief `#2563eb` / zu hoch `#dc2626`. Beide Themes ausgestaltet (helles Primär-Theme + kühles Dark-Theme).
- Evaluated: Dunkel & Bühne / Clean & Hell / Verspielt & Bunt (Screenshots/Previews im AskUserQuestion).
- Ersetzt die warm-beige/Messing-Palette des ursprünglichen Design-Plans (Feedback F-18a).
- Teal als Akzent bewusst statt des generischen Indigo gewählt und von der blauen "zu-tief"-Semantik durch Kontext/UI-Region getrennt.

D-17: [accepted] **Headstock-Darstellung:** Wirbel sichtbar am Hals montiert — Knopf überlappt die Kopfkante, kurzer Schaft (neck) führt auf die Holzfläche, Wickelachse (post) auf der Fläche, Saite von Achse zum Sattel. (behebt F-18b)
- Chosen because: v1 ließ die Mechaniken losgelöst schweben (Verbindung unsichtbar); die montierte Darstellung liest sich als echte Gitarren-Mechanik.

<!-- Pre-Mortem-Gegenmaßnahmen (Schritt 6) -->

D-18: [accepted] **Gegen Fehlerkennung/Oktavfehler & falsche Auto-Saitenwahl:** clarity-Gate (Ton nur werten, wenn pitchy-clarity ≥ Schwelle, Startwert 0.9), Median-Glättung der Frequenz über mehrere Frames, Auto-Saitenwahl nur wenn der gemessene Ton innerhalb eines Fensters (Startwert ±80 Cent) um den nächstliegenden Zielton liegt; manueller Override (D-3) hält die Saite fest. Landet in: AC-3, AC-4 + Boundary (ASK FIRST bei Schwellen-Feintuning).

D-19: [accepted] **Gegen Mikrofon-/Secure-Context-/iOS-Ausfälle:** expliziter Permission-Flow mit handlungsleitender Fehlermeldung; App nur über HTTPS ausliefern; AudioContext ausschließlich per Start-Geste `resume()` (iOS); Feature-Detection (`navigator.mediaDevices` undefined → Hinweis statt Absturz). Landet in: AC-8, AC-9 + Boundary (ALWAYS HTTPS, ALWAYS resume-on-gesture).

D-20: [accepted] **Gegen Zeiger-/Avatar-Flackern an der ±5-¢-Grenze:** Glättung (gleitender Mittelwert der Cent-Abweichung) + Hysterese-Band um die Umschaltpunkte, sodass der Avatar-/Farbzustand nicht mehrfach pro Sekunde springt. Landet in: AC-5 (verschärft).

D-21: [accepted] **Gegen Metronom-Drift/Hintergrund-Throttling:** Lookahead-Scheduler (D-8) mit Events auf `AudioContext.currentTime`, Scheduler-Loop im Web Worker, `visibilitychange`-Handling (sauberer Stop/Resync bei Tab-Wechsel). Landet in: AC-10 + Boundary (NEVER: reines setInterval für Beat-Zeitpunkte).

D-22: [accepted] **Gegen PWA-Offline-/Install-Fehler:** vollständiges Manifest (Name, 192/512-Icons, start_url, display) + Service-Worker-Precaching der App-Shell (D-9). iOS ~7-Tage-Cache-Eviction (F-14) ist eine dokumentierte bekannte Einschränkung, nicht vollständig behebbar. Landet in: AC-11 + Boundary (dokumentierte Einschränkung).

<!-- Nachträge aus Grounded Review (Schritt 8) -->

D-23: [superseded-by D-16] **Ursprüngliche Design-Plan-Palette: warm "Studio-Gerät" — warmes Anthrazit/Papier-Grund + Messing/Bernstein-Akzent.** `[reconstructed post-hoc — lower confidence]`
- Diese Palette war die initiale Design-Plan-Wahl (Mockup v1), wurde aber nie als eigener D-Eintrag live geloggt. Nachgetragen, damit die Supersede-Kette (D-16) auf eine retirierte Entscheidung zeigt statt auf einen ungeloggten Plan.
- Superseded because: User-Feedback F-18a ("Farben gefallen nicht"); ersetzt durch D-16 (Clean & Hell / Teal).

D-24: [accepted] **Grounding von Implementierungs-Detail-Aussagen der Spec** (nach Review-Groundedness-Findings):
- Modul-Dekomposition (`audio/ pitch/ tuning/ metronome/ ui/`) ist eine **empfohlene Struktur**, abgeleitet aus D-5 + den funktionalen Bereichen — nicht normativ.
- Datenmodell-Felder `{note, accidental, octave, targetHz}`: `accidental`/`octave` sind nötig, weil D-15 Stimmungen mit Vorzeichen (E♭) und expliziten Oktaven (E2…E4) enthält.
- No-Signal-Verhalten "Nadel einfrieren" ist eine Ableitung von D-18 (unter clarity-Schwelle wird kein Ton gewertet → letzte Anzeige eingefroren statt springend).
- Metronom-DoD "SD < 5 ms @ 120 BPM" ist eine **operative Zielgröße** zur Prüfung von D-8/D-21, kein musikalischer Schwellenwert (MAY angepasst werden, fällt NICHT unter ASK-FIRST).

## Rejected Approaches

- **Vanilla TS (kein Framework):** zu viel manuelle DOM/State-Verdrahtung für die reaktive UI. Reconsider, falls die App radikal auf eine Single-Screen-Minimalversion schrumpft.
- **React:** schwererer Runtime + Render-Modell-Reibung bei 60-fps-Audio-Updates. Reconsider nur bei starker React-Ökosystem-Abhängigkeit.
- **FFT-Peak-Picking für Pitch:** keine Cent-Genauigkeit bei tiefen Grundtönen (F-9). Nicht reaktivierbar für einen Tuner.
- **pitchfinder / aubiojs:** GPL/Copyleft — Lizenzrisiko für ausgelieferte App. Reconsider nur bei bewusster GPL-Auslieferung.
- **ml5 CREPE:** aus aktuellem ml5 entfernt, Modell verschollen, zu schwer/latenzreich.
- **AudioWorklet von Anfang an:** Overkill für v1; als Upgrade-Pfad dokumentiert (D-6).
- **Multi-Instrument (Bass/Ukulele):** Umfang zu groß für persönliches Tool (D-1/D-4). Reconsider bei konkretem Bedarf.

## Open Questions / Assumptions

Q-1: [resolved by D-1] Umfang der Stimmungen — entschieden: Standard EADGBE + gängige Alt-Tunings.

Q-2: [resolved by D-2] Primäres Zielgerät — entschieden: Mobile-first Portrait.

Q-3: [resolved by D-14] Kammerton — entschieden: A4 = 440 Hz fix in v1.

Q-4: [resolved by D-12] In-Tune-Toleranz — entschieden: ±5 Cent.

## Review Log (Schritt 8 — Grounded Review durch unabhängigen Subagent)

Der Subagent prüfte `spec.md` gegen `decisions.md` (nur Dateien, kein Gesprächskontext), 6 Checks:

- **Check 1 Completeness — PASS:** Alle D-1…D-22 und materiellen F-1…F-19 haben ein Zuhause in der Spec; alle „Landet in:"-Zusagen erfüllt. Soft-Note F-7 (Mockup-vor-Implementierung) nur implizit → **behoben**: expliziter Prozess-Bullet in Context.
- **Check 2 Consistency — PASS:** Keine Widersprüche (±5¢, clarity 0.9, ±80¢, BPM 40–240, A4=440, Tuning-Liste, State→Farbe alle konsistent über Journal/Design/AC).
- **Check 3 Groundedness — Findings behoben:** Modul-Layout (§1), Datenmodell-Felder (§3), No-Signal-Freeze (AC-6), 5-ms-DoD (AC-10) waren ungegroundete Elaborationen → **grounded via D-24** + Zitate in der Spec ergänzt.
- **Check 4 No leaked rejects — PASS:** AudioWorklet-first korrekt nur als Upgrade-Pfad/Out-of-Scope, nicht als v1-Pfad; FFT/GPL-Libs/Multi-Instrument sauber ausgeschlossen.
- **Check 5 Testability — Findings behoben:** AC-15 (subjektiv „kein Kontrast-Bruch"), AC-13 (Downbeat), AC-9 (resume) → **DoDs objektiv/ausführbar umformuliert** (WCAG-Kontrast-Assert, Klassen/Color-Assert, resume-Spy).
- **Check 6 Notation — PASS:** Alle 15 AC mit EARS-Typ + RFC-2119-Keyword.
- **Sanity — Findings behoben:** F-Fakten waren physisch außer Reihenfolge (F-16 am Ende) → **neu geordnet F-9…F-19**; ursprüngliche Warm-Palette war nie als D geloggt → **retroaktiv als D-23 (superseded-by D-16) erfasst**.

Ergebnis: **0 offene Widersprüche** zwischen spec.md und decisions.md. Alle Findings aufgelöst (Dokumente aktualisiert); keine als Q-N abgelehnten Findings.
