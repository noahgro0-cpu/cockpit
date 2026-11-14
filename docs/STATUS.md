# Status

Stand 2026-11-14 · Phase 1a abgeschlossen. Schritte 2 und 2b implementiert und im Browser geprüft. Nächster Entwicklungsschritt ist Prompt 1b in Claude Code.

## Erledigt
### Phase 0
- Werkzeuge: git 2.56, Node 26.13, npm 11.20, gh 2.104, clasp 3.4.1 (alle angemeldet). Die Apps Script API war entgegen dem ersten Befund noch nicht aktiviert und wurde in Phase 1a vom Nutzer eingeschaltet.
- Repo-Struktur, `.gitignore`, Doku-Prüfung (DECISIONS.md D1–D10), `shared/api-types.ts` + `docs/mock-state.json` mit Typprüfung, öffentliches Repo.

### Phase 1a – Backend-Grundgerüst
- Apps-Script-Projekt «Cockpit» mit gebundenem Sheet angelegt (`clasp create`), Web-App ausgerollt. Deployment-ID und Schlüssel liegen nur lokal in `backend/.env.local` (git-ignoriert).
- `src/lib` (reine Logik): Zürcher Zeitzone inkl. Sommer-/Winterzeit, To-do-Modell und Validierung, State/Widget-Aufbau, API-Dispatcher.
- `src/gas`: `doPost`/`doGet`, alle `todo.*`-Aktionen, `getState` (60 s Cache, gestückelt), `getWidget`, `quickAdd` (vorerst ohne KI), `event.add`, Sperre für Schreibzugriffe, Drosselung nach 10 falschen Schlüsseln pro Stunde, `setup()`, `rotateKey()`, `tick` alle 10 Min. (vorerst nur Heartbeat und Log-Kürzung).
- Persönliche Voreinstellungen in `backend/src/private.local.js` (git-ignoriert, D12). Haltestellen vom Nutzer bestätigt.
- Entscheide D11–D13 (Briefing ohne eigenen Trigger, Testaufbau, Speicherformat im Sheet).

## Abnahme Phase 1a (SPEC §6)
| Kriterium | Ergebnis |
|---|---|
| `npm test` grün | ✔ 39 Unit-Tests (`cd backend && npm test`) |
| `setup()` zweimal ohne Schaden | ✔ zweimal ausgeführt; vom Nutzer bestätigt: jeder config-Schlüssel einmal, jeder Tab einmal, genau ein Trigger `tick` |
| `ping`, `getState`, alle `todo.*`, `event.add` per curl gegen die echte Web-App | ✔ 23/23 (`cd backend && npm run e2e`), inkl. Idempotenz und Cache-Invalidierung |
| falscher Schlüssel, kaputtes JSON → saubere Fehlerantwort | ✔ `unauthorized` bzw. `bad_request`, immer JSON; GET liefert ebenfalls JSON |
| Kalender der nächsten 21 Tage im State | ✔ 36 Termine (33 Lektionen mit Raum, 3 private), Zeitraum gestern bis +21 Tage, keine Duplikate, Offset `+01:00` |

Zusätzlich geprüft: Die Antwort trägt `Access-Control-Allow-Origin: *`, `text/plain` ohne eigene Header funktioniert (D7). Umlaute, Sonderzeichen und Emojis kommen unverändert durch. Hinweis für Tests unter Windows: den Body per stdin an curl geben (`--data-binary @-`), nicht als Argument, sonst verfälscht Windows die Umlaute.

Ein echter Browser-Test (CORS aus einer Web-Seite) folgt in Phase 2 mit der PWA.

## Manuelle Schritte für den Nutzer
Keine offen (Kontrolle von Sheet und Trigger erledigt, Testtermin gelöscht).

## Hinweise für Codex (Phase 2, `web/`)
- Vertrag: `shared/api-types.ts`; Entwicklung mit `VITE_MOCK=1` und `docs/mock-state.json` (Referenzzeit Mo 16.11.2026 07:12).
- Requests: `POST` mit `Content-Type: text/plain;charset=utf-8`, keine eigenen Header, Weiterleitung folgen (`fetch` tut das). Antwort immer HTTP 200 + JSON, siehe SPEC §2.9.
- Setup-Code: base64url **ohne** `=`-Auffüllung (beide Varianten akzeptieren), SPEC §3.2.
- `todo.add`/`todo.delete`/`event.add` sind idempotent, `quickAdd` (noch) nicht.
- API-Wünsche nur in `docs/OPEN-QUESTIONS.md` eintragen; `shared/` und `backend/` nicht ändern.

## Offen / nächste Schritte
- Phase 1b: Mail-Pipeline (Regeln, Gemini, To-dos aus Mails, Labels), ntfy-Push, Erinnerungen, Briefing, KI-Schnellerfassung.
- Vorbereitung durch den Nutzer für Phase 1b: Gemini-API-Schlüssel in AI Studio und ntfy-App auf dem iPhone (Anleitung folgt mit Phase 1b).

## Bekannte Mängel
- `quickAdd` legt bis Phase 1b nur ein To-do mit dem ganzen Text als Titel an und ist bei Wiederholungen nicht idempotent (Payload hat keine id).
- Die ersten zwei Commits tragen noch den Vornamen als Autor (siehe OPEN-QUESTIONS.md).

## Phase 2 – PWA (2026-11-14, Codex)

### Erledigt
- `web/`: Vite + React + strict TypeScript + Tailwind + `vite-plugin-pwa`, importierte API-Typen aus `shared/api-types.ts`. `backend/` und `shared/` unverändert.
- Helle/dunkle Design-Tokens zuerst festgelegt; Screenshots der ersten Heute-Ansicht in 375 und 1440 px vor dem Bau der weiteren Ansichten gezeigt. Abschliessende Mock-Screenshots für 375/834/1440 px, hell/dunkel, liegen lokal in `private/previews/` (nicht in Git).
- Setup per eingefügtem Code oder `#setup=…` (Fragment wird entfernt), base64/base64url, Verbindungsprüfung; POST mit `text/plain;charset=utf-8`, Weiterleitungen, JSON-Fehlerbehandlung ohne Schlüssel in URL oder Logs.
- Heute, Drei-Wochen-Kalender mit Tagesliste/Wochengitter, To-dos mit Filtern/Bearbeiten/Datum/Uhrzeit/Erinnerung/Wischaktionen, Mails mit Vertragsaktionen, lokale Einstellungen und automatisches dreispaltiges Dashboard ab 1100 px bzw. `?kiosk=1`.
- Persistenter State-Cache und Outbox in IndexedDB; optimistische Projektion, FIFO-Wiederholung mit Backoff, Web Lock gegen parallelen Versand aus mehreren Tabs, Konflikte → Serverstand, veralteter Stand sichtbar. Mock-Daten und lokale Mock-Einstellungen getrennt von Live-Daten.
- Immer sichtbare Schnellerfassung mit deutscher Datumsvorschau und idempotentem `todo.add`. Zeitzone Europe/Zurich unabhängig von der Gerätezeitzone; nicht existierende Uhrzeiten beim Sommerzeitwechsel werden abgelehnt.
- ÖV-Richtung aus Unterrichtszeiten, Ankunft mindestens zehn Minuten vor der ersten Lektion, späteste passende Abfahrt, Gleis/Verspätung; Wetter jetzt/heute/sieben Tage. Sichtbarkeitsprüfung, Cache und Abruflimits (2/30 Min.). Im Mock-Modus keine externen Abfragen, klar markierte Demowerte.
- PWA-Manifest, PNG-Icons inkl. Apple-Touch-Icon, statischer Offline-Cache, Safe Areas, `100dvh`, Aktualisieren-Knopf, Visual-Viewport-Anpassung für die Tastatur, reduzierte Bewegung berücksichtigt.
- GitHub-Actions-Workflow `.github/workflows/pages.yml`: Tests und Build für PRs/main, Pages-Deployment nur für main, Produktionsmodus ohne Mock-Daten, Repo-Basispfad dynamisch.
- Schritt 2b ergänzt die iPad-Seitenleiste bei 700–1099 px, relative Systemtypografie, Lucide-Icons sowie Bearbeiten und Verschieben in Web-Sheets. Befunde, Prüfung und zurückgestellte Punkte stehen in `DESIGN-REVIEW.md`. Claudes Ergänzungen zu den Projektvorgaben sind übernommen.

### Abnahme Phase 2 (SPEC §6)
| Kriterium | Ergebnis |
|---|---|
| Mock-Modus | ✔ mit `VITE_MOCK=1`; alle Ansichten ohne Backend nutzbar |
| Echtes Backend | ✔ Browser-CORS/Weiterleitung sowie `ping`, `getState`, To-do anlegen, idempotent wiederholen, ändern, erledigen und löschen geprüft; temporärer Testeintrag entfernt |
| Offline letzter Stand und Nachsenden | ✔ Chromium: Produktions-PWA offline neu geladen, To-do optimistisch erfasst, nochmals offline geladen, bei Rückkehr online genau einmal gesendet |
| Chrome-Installierbarkeit | ✔ Produktionsbuild: Service Worker kontrolliert die Seite; CDP `Page.getInstallabilityErrors` liefert keine Fehler |
| 375 / 834 / 1440 px, hell/dunkel | ✔ Browser-Prüfung aller Ansichten ohne horizontalen Überlauf; Mock-Screenshots erstellt und visuell geprüft |
| iPhone/iPad Home-Bildschirm, Vollbild | Offen: echte Geräte stehen für diese Prüfung nicht zur Verfügung |
| Öffentliche GitHub-Pages-Auslieferung | GitHub Pages auf «GitHub Actions» eingestellt. Bereitstellung über den Workflow auf `main`. |

Zusätzliche Prüfung: 47 Unit-Tests grün (`cd web; npm test`), TypeScript/Produktionsbuild grün (`npm run build`). Tests decken Datum/DST, Gruppierung, API-Client, Setup, Outbox-Persistenz/Reihenfolge/Backoff/Konflikte, Schnellerfassung und ÖV-Auswahl ab. Der erste GitHub-Actions-Lauf deckte eine vom Host abhängige Uhrzeit in `chrono-node` auf. Die Schnellerfassung verwendet nun die Zürcher Referenzzeit und den Zürcher Offset des Zieldatums. UTC und America/New_York wurden separat getestet. Bei einer nicht existierenden Stunde zeigt die Vorschau nur das Datum. `npm audit --omit=dev` ergab keine Befunde. Die Entwicklungsabhängigkeiten melden vier niedrige Befunde in der Workbox-Kette für dasselbe `deepmerge`-Problem.

### Einschränkungen / offene API-Punkte
- Die Phase-2-Abnahme auf echten iPhones und iPads bleibt offen. Claude Code kann parallel mit Prompt 1b beginnen, sobald Codex die Arbeit im gemeinsamen Ordner beendet hat.
- Die Mail-Handler fehlen im Phase-1a-Backend. Die PWA ruft die vertraglichen Aktionen auf; Mock-Aktionen funktionieren lokal. Echte Mail-Aktionen folgen nach Phase 1b.
- Einstellungen gelten lokal pro Gerät; eine Backend-Schreibaktion fehlt. API-Wunsch in `OPEN-QUESTIONS.md`.
- `quickAdd` sowie Mail-Erstellung/Feedback besitzen keine zugesicherte Request-Idempotenz. Schnellerfassung verwendet deshalb `todo.add`; unklar bestätigte Mail-Schreibaktionen warten in den Einstellungen auf manuelle Prüfung. Sie werden nicht automatisch doppelt versandt.
- Die Live-ÖV-Ankunftsplanung, Gesten, Safe Areas und das Verhalten mit der iOS-Tastatur brauchen einen abschliessenden Gerätetest. Auswahl-/Zeitzonenlogik ist unit-getestet, Darstellung im Mock-Modus geprüft.

### Manuelle Schritte für den Nutzer (Phase 2)
1. **Lokal ansehen:** Terminal im Repo öffnen → `cd web` → `npm ci` → in PowerShell `$env:VITE_MOCK='1'` → `npm run dev` → die ausgegebene lokale Adresse öffnen. Unter Einstellungen zwischen Hell/Dunkel/Automatisch wechseln; Browserbreite ab 1100 px zeigt das Dashboard.
2. **Veröffentlichte App öffnen.** Auf GitHub zum Repository → **Settings → Pages → Visit site**. Neue Änderungen an `web/` auf `main` lösen den Workflow unter **Actions → Test and deploy PWA** aus.
3. **Echte Verbindung:** Im Google Sheet den Tab **config** öffnen → Wert neben **setupCode** kopieren → PWA öffnen → Feld **Setup-Code** → einfügen → **Cockpit verbinden**. Den Code nicht in GitHub, Quellcode oder Chat einfügen. Auf jedem Gerät separat verbinden.
4. **iPhone/iPad installieren:** Die veröffentlichte PWA in **Safari** öffnen → **Teilen** → **Zum Home-Bildschirm** → **Hinzufügen**. Die App über das neue Symbol starten. Prüfen: Vollbild ohne Browserleiste, nichts unter Kameraausschnitt/Home-Indikator, Schnellerfassung und Speichern bei geöffneter Tastatur erreichbar. Auf iPhone und iPad jeweils durchführen.
5. **Offline auf dem Gerät prüfen:** App online öffnen → Flugmodus aktivieren → App schliessen und neu öffnen → letzter Stand sichtbar → ein Test-To-do erfassen → Flugmodus ausschalten → **Aktualisieren** → prüfen, dass das To-do genau einmal im Sheet steht. Test-To-do unter **To-dos → Stift → Löschen** entfernen.
6. **ÖV/Wetter prüfen:** **Einstellungen** → Haltestellen/Koordinaten kontrollieren → bei Änderungen **Auf diesem Gerät speichern**. An einem Unterrichtstag vor der ersten Lektion Hinweg, nach der letzten Lektion Rückweg sowie Gleis/Verspätung prüfen. Wetterkarte → **7-Tage-Vorschau** öffnen.
7. **Chrome kontrollieren:** Veröffentlichte PWA öffnen → F12 → **Application → Manifest** (keine Installierbarkeitsfehler) → **Service workers** (aktiv). Danach über das Installieren-Symbol in der Adressleiste installieren. Die Ergebnisse der Geräte-/Pages-Abnahme hier nachtragen.

## Übergabe an Claude Code für Prompt 1b

1. In `C:\Dev\cockpit` den Abschnitt **Prompt 1b – Claude Code** aus `ARBEITSPLAN.md` starten. Einstieg gemäss `AGENTS.md` und im Prompt. `backend/` und `shared/` stehen auf dem Phase-1a-Vertrag. Die PWA und ihr Workflow liegen in `web/` und `.github/workflows/pages.yml`.
2. Mail-Pipeline, Notifier, Erinnerungen, Briefing und `quickAdd` gemäss SPEC §2.6, §2.8 sowie der Phase-1b-Abnahme umsetzen. `mode=observe` beibehalten. Dieselbe Apps-Script-Deployment-ID verwenden, damit die eingerichteten PWA-Verbindungen weiter funktionieren.
3. `mail.toTodo`, `mail.dismiss` und `mail.feedback` mit den bestehenden Payloads ergänzen. Die PWA ruft diese Aktionen bereits auf. Entscheidungen zu Idempotenz, `quickAdd` mit Client-UUID und einer Settings-Schreibaktion in `OPEN-QUESTIONS.md` nachtragen. Bei Vertragsänderungen die Kompatibilität mit der veröffentlichten PWA sicherstellen und erforderliche Frontend-Änderungen für Codex notieren. `quickAdd` für den Siri-Kurzbefehl mit `{text}` kompatibel halten, falls eine optionale Request-ID ergänzt wird.
4. Für die Integrationsabnahme nach dem Deployment einen Weg mit Testdaten wählen. In der PWA prüfen, ob der nächste `getState` Mail und To-do zeigt und die drei Mail-Aktionen im Sheet erwartungsgemäss wirken. Testdaten danach entfernen. `web/scripts/backend-browser-check.mjs` prüft browserseitiges CORS, `ping`, `getState` und einen selbst aufgeräumten Test-To-do-Zyklus. Es protokolliert weder Schlüssel noch persönliche Inhalte. `cd web; npm test; npm run build` prüft die Auswirkungen auf die PWA.
5. Den Nutzer nach `ANLEITUNG.md` **C4** durch Gmail-Berechtigung, Gemini-Skripteigenschaft, ntfy-Abonnement und Testmails führen. Danach die Phase-1b-Ergebnisse und verbleibenden Punkte hier ergänzen. Die Installation aus C3 auf echten Geräten ist separat zu bestätigen.
