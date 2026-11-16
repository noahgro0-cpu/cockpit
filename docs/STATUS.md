# Status

Stand 2026-11-16 · **D28: Termine bearbeiten, Notizseiten mit Formatierung, Widget getönt** (Abschnitt zuunterst; davor D27). Phase 4 abgeschlossen (Abnahme unten). Der Nutzer testet das Cockpit eine Woche im Alltag; danach weitere Verbesserungen nach Bedarf. Betrieb: `docs/BETRIEB.md`.

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
- Siehe Abschnitt «Phase 1b → Offen / nächste Schritte» unten.

## Bekannte Mängel
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
| Öffentliche GitHub-Pages-Auslieferung | ✔ GitHub Actions, Lauf `43647229257` auf `2166c09`: Tests, Build und Deploy erfolgreich. Die veröffentlichte PWA liefert HTTPS 200. Setup und Laden des echten Backend-States sowie aktiver Service Worker und Installierbarkeit aus dem veröffentlichten Ursprung geprüft. |

Zusätzliche Prüfung: 47 Unit-Tests grün (`cd web; npm test`), TypeScript/Produktionsbuild grün (`npm run build`). Tests decken Datum/DST, Gruppierung, API-Client, Setup, Outbox-Persistenz/Reihenfolge/Backoff/Konflikte, Schnellerfassung und ÖV-Auswahl ab. Der erste GitHub-Actions-Lauf deckte eine vom Host abhängige Uhrzeit in `chrono-node` auf. Die Schnellerfassung verwendet nun die Zürcher Referenzzeit und den Zürcher Offset des Zieldatums. UTC und America/New_York wurden separat getestet. Bei einer nicht existierenden Stunde zeigt die Vorschau nur das Datum. `npm audit --omit=dev` ergab keine Befunde. Die Entwicklungsabhängigkeiten melden vier niedrige Befunde in der Workbox-Kette für dasselbe `deepmerge`-Problem.

### Einschränkungen / offene API-Punkte
- Die Phase-2-Abnahme auf echten iPhones und iPads bleibt offen. Sie ist keine Voraussetzung für den Start von Prompt 1b. Im gemeinsamen Ordner immer nur einen Agenten gleichzeitig arbeiten lassen.
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

## Phase 1b – Mails, KI, Push (2026-11-14/15, Claude Code)

### Erledigt
- **Mail-Pipeline in `tick`** (`src/gas/pipeline.js`, Logik in `src/lib/mail.js`, `rules.js`, `ai.js`):
  - **Suche:** Sync − 1 h, erster Lauf 3 Tage zurück; Duplikatschutz über die Message-ID; reine Ausgangsmails übersprungen (D15); höchstens 25 Mails pro Lauf.
  - **Regeln** aus dem Tab `regeln`, zusätzlich vorhandene Gmail-Labels. Sensible Mails gehen nie an die KI (D16).
  - **KI:** Stapel zu 8, JSON-Schema, strikte Validierung (Enums, Längen, Frist, doppelte/unbekannte refs). Fallback: `none`/1, bis zu 3 Versuche.
  - **Danach:** höchstens 1 To-do pro Thread; Labels nur bei `mode = active`.
  - **Push** über eine Warteschlange mit Ruhezeit und Nachlieferung. Push-Texte enthalten nur Absender und Betreff, nie KI-Text.
- **Notifier** (`src/gas/notify.js`): Kanäle Telegram (Standard) und ntfy (D19), Auswahl über `config.pushChannels`. Dazu To-do-Erinnerungen (`remindAt`, sonst 60 Min. vor `due` mit Uhrzeit), Briefing aus einer Textvorlage (Werktag/Wochenende, D11) und Störungsmeldung nach 3 fehlgeschlagenen `tick` (höchstens 1× pro 6 h).
- **Editor-Funktionen:** `sendTestNotification`, `telegramSetup`, `diagnoseNtfy` (prüft Erreichbarkeit und ntfy-Kontingent, sendet nichts an das echte Topic).
- **API:**
  - `quickAdd` mit KI-Zerlegung und optionaler `id` (idempotent, Siri bleibt mit `{text}` kompatibel).
  - `mail.toTodo`, `mail.dismiss` und `mail.feedback` sind idempotent. `mail.feedback` legt eine Absender-Regel zuoberst an bzw. aktualisiert sie.
  - Neu: `settings.update`. Die Wünsche von Codex sind beantwortet (OPEN-QUESTIONS.md, D17).
- **Schema-Migration** ohne Editor-Lauf: `tick` ergänzt Spalten (`mails.aiAttempts`), neue `config`-Schlüssel (`mailCategories`, `sensitiveCategories`, `junkCategory`, `pushChannels`) und die Start-Regeln aus `private.local.js`.
- Config-Zellen, die Sheets in Uhrzeiten umgewandelt hat («6:30»), werden richtig gelesen.
- Entscheide D15–D19; SPEC §2.2, §2.3, §2.4, §2.6 und §2.8 nachgeführt. Deployment @6 (dieselbe ID), Code danach per `clasp push` aktuell.

### Abnahme Phase 1b (SPEC §6)
| Kriterium | Ergebnis |
|---|---|
| `npm test` grün | ✔ 86 Unit-Tests (Regeln, Validierung, KI mit aufgezeichneten Antworten inkl. Injektionsversuch, Ruhezeit inkl. Sommer-/Winterzeit, Briefing-Text, Erinnerungen, Warteschlange, Kanäle) |
| Testmail mit Frist → Mail-Eintrag, To-do, Push innert 10 Min. | ✔ Mail 00:45 → `tick` 00:47:58: Eintrag (KI: 3, Frist 25.11.), To-do «Laborbericht einreichen». ntfy lieferte erst beim Wiederholungsversuch, siehe D19. Telegram: Mail 01:15 → `tick` 01:17:59: Eintrag (KI: 3, Frist 30.11.), To-do «Für Prüfung anmelden», Telegram-Push um 01:18 auf iPhone und iPad angekommen (vom Nutzer bestätigt), also rund 3 Min. nach dem Versand der Mail |
| Sensible Mail erreicht die KI nicht (Log) | ✔ Log 00:27:56 «mail 1a1dc61e…: sensitive (rule row 2) – not sent to AI»; die KI-Zeile 00:27:57 enthält nur die drei anderen IDs |
| Ohne `GEMINI_API_KEY` läuft alles regelbasiert | ✔ Erster Lauf 23:38 ohne Schlüssel: 12 Mails erfasst (`none`/1), 0 Fehler. Nach dem Eintragen des Schlüssels hat die KI sie nachklassifiziert |
| Modus `observe`: Postfach unverändert | ✔ Code: Gmail ändert nur `applyLabelOps_`, das bei `observe` nichts bekommt (Unit-Test prüft Plan und Aufrufstellen). Gemeinsamer Test: keine Labels gesetzt, Mails ungelesen im Posteingang |
| `tick` ohne neue Mails < 10 s | ✔ 4,7 s (Ausführung 00:37); mit 4 neuen Mails inkl. KI 7,0 s |

Weitere Ergebnisse aus dem gemeinsamen Test:
- **Newsletter:** von der KI mit 0 bewertet, erscheint nicht in der App.
- **Injektionsmail:** von der KI nur mit 1 («Info») bewertet; die eingeschleusten Anweisungen hat sie nicht befolgt.
- **Ruhezeit:** Eine dringende Mail um 00:28 wurde wegen Ruhezeit 00:00–06:30 zurückgehalten. ✔ Am 15.11. um 06:37 nachgeliefert (vom Nutzer bestätigt), zusammen mit dem Push einer echten Schul-Mail mit Frist.
- **Briefing:** ✔ Sonntag 15.11. um 09:07 (Wochenendzeit 09:00) angekommen: «Heute keine Termine», «Keine To-dos fällig», «5 wichtige Mails seit gestern».

### Manuelle Schritte für den Nutzer
1. ~~Ruhezeit zurückstellen~~ ✔ erledigt (14.11. abends).
2. ~~Morgen früh prüfen~~ ✔ erledigt (siehe oben).
3. **Regeln pflegen** (optional; der Nutzer erhält selten sensible Mails, der aktuelle Filter genügt ihm) (Sheet → Tab `regeln`): Absender von Krankenkasse, Versicherungen, Bank, Vermietung und Arbeitgeber eintragen (Domain hinter dem @, `sensibel = ja` wo nötig). Siehe ANLEITUNG.md C4 Punkt 5.
   - Die Regel für die Hochschule hat absichtlich **keine** feste Wichtigkeit: So bewertet die KI Fristen und erzeugt To-dos. Mit einer festen 2 gäbe es aus diesen Mails keine automatischen To-dos.
4. **Testdaten aufräumen** (optional): In der PWA unter «Mails» die Testmails mit «Erledigt» entfernen und die drei Test-To-dos («Anmeldung Labor bestätigen», «Laborbericht einreichen», das von der Telegram-Testmail) löschen.
5. **ntfy-App** kann bleiben (Reserve) oder gelöscht werden. Das Backend nutzt Telegram, solange es eingerichtet ist.
6. ~~GitHub~~ ✔ Phase-1b-Commits am 15.11. nach Freigabe gepusht.

### Offen / nächste Schritte
- PWA-Integration der Mail-Aktionen im echten Betrieb prüfen: Mail → To-do, Erledigt, «War (un)wichtig» → Sheet kontrollieren (STATUS «Übergabe 1b» Punkt 4). Backend-Handler sind fertig, aber noch nicht live mit der PWA getestet.
- ~~`quickAdd` mit KI live testen~~ ✔ 15.11.: «Python Übung Freitag 14 Uhr abgeben» → «Python Übung abgeben», Fr 20.11. 14:00, Kategorie Python; «morgen Mathe Serie 5 lösen» → 16.11., Mathe; «Zahnarzt anrufen nächste Woche» → ohne Datum (vage Angabe nicht aufgelöst). Testeinträge gelöscht.
- Codex (Phase 2/3): optionale PWA-Anpassungen laut OPEN-QUESTIONS.md (`settings.update`, `quickAdd` mit `id`, Sperre bei Mail-Aktionen entfernen). Für das Siri-Kurzbefehl-Setup (Phase 3) bleibt `quickAdd {text}` gültig.
- Phase 5: Web Push als weiterer Kanal (Schnittstelle vorhanden).

### Bekannte Mängel
- **ntfy.sh** ist von Apps Script aus unzuverlässig: Das Kontingent hängt an den geteilten Google-IPs, auch mit Gratis-Konto (D19). Nur noch Reserve.
- **Gemini-Fixtures** in `backend/test/fixtures/` sind im Format echter Antworten nachgebaut, nicht vom Live-Modell aufgezeichnet. Dass das Live-Modell eine Injektion ignoriert, ist durch den gemeinsamen Test (Mail D) belegt.
- **Briefing am 14.11.:** um 23:38 nachträglich erzeugt und wegen der Verspätung (> 3 h) nicht gepusht. Das ist so gewollt.
- **Nachklassifizierung:** Mails, die ohne KI eingingen, werden innerhalb von 14 Tagen nachklassifiziert, sobald die KI verfügbar ist. Pushes gibt es dafür nur bei Mails, die jünger als 24 h sind.

## Erweiterung: Wetter mit Kleidungsempfehlung im Briefing (2026-11-15, Claude Code)

### Erledigt
- `src/lib/weather.js` (reine Logik) und `src/gas/weather.js`: Das Briefing enthält als zweite Zeile das Wetter mit Kleidungs- und Schirmempfehlung (D20, SPEC §2.8).
  - **Unterrichtstag:** zuerst der Weg am Startort (2 h bis 30 Min. vor der ersten Lektion), dann der Campus während der Lektionen. Gleiche Temperaturklasse wird nicht wiederholt.
  - **Ohne Lektionen (Wochenende):** ein Satz für den Rest des Tages am Aufenthaltsort.
  - **Startort:** Wohnort, ausser der iOS-Kurzbefehl hat in den letzten 12 h einen Standort > 5 km davon gemeldet.
  - Fällt Open-Meteo aus, geht das Briefing ohne Wetter hinaus (Log-Eintrag `weather`).
- Neue API-Aktionen `location.update` und `briefing.preview` (`shared/api-types.ts`). Der Standort wird gerundet (~1 km), nur der letzte Wert bleibt, er erscheint nicht im State; im Log steht nur «location updated» ohne Koordinaten oder Ort. `briefing.preview` nimmt optional `{date}` (bis +7 Tage).
- Neue `config`-Schlüssel `homeName`, `campusLat`, `campusLon`, `campusName`, `weatherInBriefing`; Werte aus `private.local.js`, werden vom nächsten `tick` ergänzt (Schema-Version 4).
- Editor-Funktionen `previewBriefing()` und `shortcutSetup()`.
- 102 Unit-Tests grün (u. a. Zeitfenster bei Sommer-/Winterzeit und am Umstellungstag, Kleidungsklassen, Regen/Schnee/Wind, Standort-Validierung und -Frische).
- Live geprüft (Deployment @13, dieselbe ID): Open-Meteo aus Apps Script erreichbar (bei einem Fehler ein zweiter Versuch nach 3 s); `briefing.preview` liefert Wetter, für Montag 16.11. mit Weg am Wohnort und Campus; wiederholter Regenhinweis wird verkürzt; `location.update` mit einem entfernten Ort → Briefing nennt diesen Ort; ungültige Koordinaten → `bad_request`. Der Teststandort wurde danach auf den Wohnort zurückgesetzt.

### Manuelle Schritte für den Nutzer (iOS-Kurzbefehl «Standort fürs Briefing»)
Einmalig, ca. 10 Minuten. Danach läuft alles automatisch. Die Bezeichnungen in iOS sind nicht auf einem Gerät geprüft und können je nach iOS-Version leicht abweichen.

**A. Werte bereitstellen**
1. Nichts zu tun: Das Backend schreibt seit Deployment @14 beim nächsten automatischen Lauf (alle 10 Min.) einmalig die Zeilen **shortcutUrl** und **shortcutText** zuunterst in den Tab **config**.
2. Fehlen sie trotzdem: Google Sheet → **Erweiterungen → Apps Script** → links die Datei **gas/weather.gs** öffnen → oben in der Funktionsauswahl **shortcutSetup** wählen → **Ausführen**.

**B. Kurzbefehl bauen (auf dem iPhone)**
1. App **Kurzbefehle** öffnen → unten **Automation** → oben rechts **+**.
2. **Tageszeit** wählen → **Uhrzeit 06:00**, **Täglich** → unten **Sofort ausführen** wählen, **Bei Ausführung mitteilen** ausschalten → **Weiter**.
3. **Neuer leerer Kurzbefehl** → **Aktion hinzufügen** → im Suchfeld «Aktuellen Standort» → **Aktuellen Standort abrufen** antippen.
4. Erneut suchen: «Text» → **Text** antippen. In der App **Google Sheets** den Tab **config** öffnen, die Zelle neben **shortcutText** antippen → **Kopieren** → zurück in Kurzbefehle → ins Textfeld **Einsetzen**.
5. Im eingefügten Text die Platzhalter ersetzen:
   - das Wort `LAT` markieren und löschen, dann über der Tastatur **Aktueller Standort** antippen. Danach die eingefügte blaue Variable antippen und **Breitengrad** wählen.
   - `LON` ebenso ersetzen, dabei **Längengrad** wählen.
   - `ORT` ebenso ersetzen, dabei **Stadt** wählen.
   - Die Anführungszeichen um die Variablen stehen lassen.
6. Suchen: «URL abrufen» → **Inhalte von URL abrufen** antippen. Ins Feld **URL** den Wert neben **shortcutUrl** aus dem Sheet einsetzen.
7. Bei dieser Aktion auf den Pfeil **›** tippen → **Methode: POST** → beim Feld für den Inhalt der Anfrage (je nach iOS-Version «Haupttext anfordern» oder «Anfragetext») **Datei** wählen → bei **Datei** die Variable **Text** wählen.
8. Oben rechts **Fertig**.

**C. Testen und Berechtigung**
1. Die Automation öffnen → unten rechts **▶︎** (Ausführen). Fragt iOS nach dem Standort: **Erlauben**.
2. **Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Kurzbefehle** → falls angeboten **Immer** wählen und **Genauer Standort** eingeschaltet lassen.
3. Im Sheet, Tab **log**, steht zuunterst «location updated». Das Ergebnis Claude melden.
4. **Am nächsten Morgen:** Steht im Tab **log** um ca. 06:00 wieder «location updated», obwohl das iPhone gesperrt war? Ergebnis hier vermerken.
5. Danach die Zeilen **shortcutUrl** und **shortcutText** im Tab **config** löschen. Die Zeile auswählen → Rechtsklick → **Zeile löschen**.

### Ergebnis Einrichtung (15.11.)
- ✔ Automation täglich 06:00, «Sofort ausführen», Mitteilung aus, Standort «Immer». Aktionen: Aktuellen Ort abrufen → Text (JSON) → URL → Inhalte von URL abrufen (POST, Haupttext anfordern: Datei = Text). Für `name` die Eigenschaft **Ort** (iOS bot «Stadt» nicht an).
- ✔ Manueller Lauf 15:17: Antwort `{ok:true}`, im Log «location updated».
- Weil «Ort» je nach iOS die ganze Adresse enthalten kann, speichert das Backend seit Deployment @15 nur noch den Ortsnamen (Strasse/Hausnummer werden verworfen, `placeName`).
- `rotateKey()` schreibt jetzt auch `shortcutUrl`/`shortcutText` neu in den Tab `config`.

### Offen
- **16.11. ab 06:00:** Tab `log` → steht um ca. 06:00 «location updated» (iPhone gesperrt)? Ergebnis hier vermerken.
- **Schlüssel erneuern** einmal, nachdem alle Kurzbefehle und Widgets (Phase 3) eingerichtet sind, und sofort, falls der Schlüssel in einem Chat oder Screenshot sichtbar war. Ablauf: Apps Script → Datei **gas/setup.gs** → **rotateKey** ausführen → neuen Setup-Code in jeder PWA (Einstellungen → neu verbinden) und neuen `shortcutText` in jedem Kurzbefehl einsetzen. Zwischen Rotation und Neueinrichtung schlagen die alten Geräte fehl (`unauthorized`); die Widgets zeigen den letzten Stand.
- Auf dem Gerät prüfen, ob der Kurzbefehl auf dem gesperrten iPhone den Standort liefert. Wenn nicht: zusätzlich eine Automation **Wecker → Wird gestoppt** mit demselben Kurzbefehl. Bleibt auch das erfolglos, gilt immer der Wohnort.
- Das erste echte Briefing mit Wetter am Montag 16.11. um 06:30 kontrollieren (Unterrichtstag: Weg + Campus).
- Für Codex (Phase 3): In `docs/SETUP-iOS.md` den Standort-Kurzbefehl aus Abschnitt B übernehmen. Für den Siri-Kurzbefehl `quickAdd` dieselbe Methode verwenden: Werte über `shortcutSetup` und das Sheet bereitstellen. Die PWA braucht keine Änderung, der Briefing-Text wird nur länger.

### Bekannte Mängel
- Die Kleidungsregeln sind Faustregeln: Grenzen bei gefühlten 3/9/15/23 °C, Schirm ab 30 % bzw. 60 %. Anpassen nach den ersten Wochen, wenn die Empfehlungen nicht passen.
- Der Ortsname am Wochenende kommt vom iPhone («Stadt»). Fehlt er, steht «an deinem Standort».

## Übergabe an Codex für Phase 3 (Stand 2026-11-15)

Prompt «Prompt 3 – Codex» aus `ARBEITSPLAN.md` starten und zusätzlich diese Punkte erledigen. `backend/` und `shared/` nicht ändern; API-Wünsche in `docs/OPEN-QUESTIONS.md`.

1. **Briefing-Zeilen in der PWA (Fehler, zuerst):** `web/src/Today.tsx` rendert `state.briefing.text` in einem `<p>`, die `\n`-Zeilenumbrüche gehen verloren und die Zeilen laufen ineinander. Lösung: in `web/src/style.css` bei `.briefing p` `white-space: pre-line;` ergänzen oder die Zeilen einzeln rendern. Auch im Dashboard-Modus (`.dashboard .briefing`) prüfen. Mock-Daten: `docs/mock-state.json` → `briefing.text` darf zur Prüfung eine Wetterzeile enthalten (frei erfundener Ort).
2. **Widgets nach SPEC §4 (Stand 2026-11-15, D21: kleines Widget und Sperrbildschirm ohne ÖV, stattdessen wichtigste Mail und To-dos; keine ÖV-Abfrage im Widget)** über `getWidget` (Felder siehe `WidgetState` in `shared/api-types.ts`: `nextEvent`, `today`, `todos` (5), `mails` (3)).
3. **Siri-Kurzbefehl mit `capture` statt `quickAdd` (D22):** diktierter Satz → POST `{key, action:"capture", payload:{text}}` → `data.message` als Mitteilung anzeigen. **Wichtig:** Den Anfragetext in «Inhalte von URL abrufen» als **JSON** (Wörterbuch mit den Feldern `key`, `action`, `payload` → `text`) aufbauen, nicht als Text-Vorlage. Dann maskiert iOS Anführungszeichen im diktierten Satz selbst. **Idempotenz:** Termine sind mit `id` nur 6 h lang (Cache, bestmöglich) gegen Doppel geschützt. Die PWA-Outbox soll `capture` deshalb nicht über Stunden wiederholen und bei Termin-Ergebnissen keinen späten Neuversuch machen. Der Satz wird To-do oder Kalendertermin. Optional in der PWA: Schnellerfassung über `capture` mit `id`, Vorschau vor dem Speichern mit `dryRun: true`. Danach den Stand neu laden, weil ein Termin auch im Kalender-State erscheint.
4. **`docs/SETUP-iOS.md`:** den Standort-Kurzbefehl aus dem Abschnitt «Erweiterung: Wetter … → Manuelle Schritte» oben übernehmen, ebenso den Siri-Kurzbefehl `quickAdd`. URL und Schlüssel kommen für alle Kurzbefehle aus der Editor-Funktion `shortcutSetup()` (schreibt `shortcutUrl`/`shortcutText` in den Tab `config`). Für den Siri-Kurzbefehl den Text entsprechend anpassen: `action` `capture`, `payload` `{text}`; Ergebnis über «Wörterbuchwert abrufen» `data` → `message` als Mitteilung.
5. **Optional (nicht dringend):** die PWA-Anpassungen aus `docs/OPEN-QUESTIONS.md` (`settings.update`, `quickAdd` mit `id`, Sperre bei Mail-Aktionen entfernen).
6. Am Ende `cd web; npm test; npm run build` und `docs/STATUS.md` nachführen.

## Erweiterung: Schnellerfassung als To-do oder Termin (2026-11-15, Claude Code)

### Erledigt
- Neue Aktion `capture` (D22, SPEC §2.4, `shared/api-types.ts` → `CaptureResult`). `src/lib/capture.js` (rein, 13 Tests), `capture_` in `src/gas/api.js`, `createCaptureEvent_` in `src/gas/calendar.js`. `quickAdd` nutzt denselben Parser, liefert weiterhin immer ein To-do.
- Regeln für ungenaue Daten: «nächste Woche» = Montag, «Ende nächste Woche» = Freitag usw. (D22). Sie gelten auch ohne KI und bei sensiblem Text.
- 115 Unit-Tests grün (die alten quickAdd-Parser-Funktionen wurden entfernt, ihre Tests laufen jetzt gegen den capture-Parser). `npm run e2e` 23/23 nach dem Umbau; `quickAdd` live geprüft (immer To-do, Testeintrag gelöscht). Deployment @17 (dieselbe ID), neuer `config`-Schlüssel `calCapture` (leer = Standardkalender), Schema-Version 6.
- Live geprüft (15.11., Probelauf ohne Schreiben):

| Satz | Ergebnis |
|---|---|
| «Zahnarzt Dienstag 15 Uhr» | Termin Di 17.11. 15:00–16:00 |
| «Training Donnerstag 18:30 bis 20 Uhr in der Halle» | Termin Do 19.11. 18:30–20:00, Ort Halle |
| «Python Übung Freitag 14 Uhr abgeben» | To-do, fällig Fr 20.11. 14:00 |
| «Zahnarzt anrufen nächste Woche» | To-do, fällig Mo 16.11. |
| «Bericht ende nächste Woche abgeben» | To-do, fällig Fr 20.11. |
| «Geburtstagsparty von Lea am Samstag» | ganztägiger Termin Sa 21.11. |
| «Mittagessen mit Tim nächste Woche» | ganztägiger Termin Mo 16.11. |
| «Prüfung für Mathe lernen übernächste Woche» | To-do, fällig Mo 23.11. |
| Notiz mit Stichwort Krankenkasse | sensibel → nicht an die KI, To-do mit Datum aus der Regel |

- Echter Schreibtest: «Testtermin Cockpit heute 23 Uhr im Büro» zweimal mit derselben `id` → genau ein Termin im Standardkalender, erscheint im State.

### Manuelle Schritte für den Nutzer
1. Im Google-Kalender den Termin **«Testtermin Cockpit»** (So 15.11., 23:00) löschen. Er stammt vom Schreibtest.
2. Optional: Sollen Termine in einen anderen Kalender als den Standardkalender? Dann im Sheet → Tab `config` → `calCapture` den exakten Kalendernamen eintragen.

### Bekannte Mängel
- ~~«nächste Woche» am Sonntag~~ vom Nutzer so bestätigt (kommende Woche). Neu: «Montag in einer Woche» usw. = nächster solcher Tag + 7 (live geprüft: am So 15.11. → Mo 23.11.).
- Die KI liess einmal einen Umlaut weg («loschen» statt «löschen»), obwohl die Anweisung das ausdrücklich verbietet. Seltener Ausreisser, beobachten.
- Ob ein Satz ein Termin oder ein To-do ist, entscheidet die KI. Im Zweifel nimmt sie ein To-do. Ein falsch eingeordneter Satz lässt sich in der App bzw. im Kalender von Hand korrigieren.

## Phase 3 – Widgets und iOS-Kurzbefehle (2026-11-15, Codex)

### Erledigt

- Das Briefing erhält Zeilenumbrüche mit `white-space: pre-line`. Die bisher ausgeblendete Briefing-Karte ist auch im Dashboard sichtbar. Drei Briefing-Zeilen in Chromium bei 375 und 1440 px geprüft, jeweils hell und dunkel.
- `widgets/Cockpit.js` bietet drei Home-Bildschirmgrössen und ein rechteckiges Sperrbildschirm-Widget. `heute` zeigt die kompakte Ansicht, `todos` priorisiert Aufgaben und `woche` ergänzt Datumsangaben und gibt der Wochenagenda Platz. Home-Bildschirmfarben entsprechen den PWA-Tokens, am Sperrbildschirm bestimmt iOS den Farbton. Der Setup-Code und die PWA-Adresse werden auf dem jeweiligen Gerät eingetragen.
- `getWidget` wird mit dem bestehenden POST-Vertrag abgerufen. Die letzte gültige Antwort wird lokal auf dem Gerät gespeichert. Bei einem Fehler zeigt das Widget diese mit «Stand hh:mm». Beim Start ohne Cache erscheint eine Fehlermeldung. Die nächste Aktualisierung wird 15 Minuten nach dem Lauf vorgeschlagen.
- [SETUP-iOS.md](SETUP-iOS.md) dokumentiert die PWA-Installation, alle Widgets, den Siri-Kurzbefehl mit `capture` als JSON und `data.message` als Mitteilung, «Auf Rückseite tippen» sowie die bereits eingerichtete Standort-Automation.

### Abnahme Phase 3 (SPEC §6)

| Kriterium | Ergebnis |
| --- | --- |
| Alle vier Grössen zeigen Daten und einen brauchbaren Fehlerzustand | Node prüft Inhalt, PWA-Link, Aktualisierungszeit sowie Rendering mit frischer Antwort, Cache und Fehler ohne Cache mit Scriptable-Attrappen. Die echte `getWidget`-Antwort wurde in allen zwölf Kombinationen aus Grösse und Parameter verarbeitet. Darstellung und Verhalten auf iPhone/iPad sind offen. |
| Grosses Widget zeigt die Woche und wichtige Mails | ✔ Backend liefert `week` seit Deployment @21 (Claude Code, 15.11.). Das Widget-Modell wurde mit der echten `getWidget`-Antwort in allen vier Grössen geprüft, ohne Hinweis «nicht verfügbar». |
| Anleitung ohne Vorwissen befolgbar | Menüpfade mit der Apple- und Scriptable-Dokumentation abgeglichen. Auf dem iPad mit Hilfestellung zur Diktat-Variable eingerichtet. Der Nutzer bestätigt, dass das Diktat ein To-do in Cockpit erzeugt. Die Mitteilung zeigt aktuell das gesamte `data`-Objekt. Der Text aus `data.message` ist noch am Gerät zu prüfen. |

Tests und Build vor Ort: `cd widgets; npm test` (10), `cd web; npm test` (47) und `npm run build`, `cd backend; npm test` (116). Die Widget-Tests prüfen auch beide Zürcher Zeitumstellungen. Offen bleibt nur der Gerätetest auf iPhone/iPad.

### Manuelle Schritte auf iPhone/iPad

1. **PWA installieren.** In Safari `https://<GitHub-Benutzername>.github.io/cockpit/` öffnen (oder GitHub **Settings → Pages → Visit site**). In Safari **Teilen → Zu Home-Bildschirm hinzufügen → Hinzufügen**. Cockpit über das Symbol öffnen und den Setup-Code aus dem Sheet (**config → setupCode**) einsetzen.
2. **Scriptable einrichten.** **Scriptable → +** öffnen, `widgets/Cockpit.js` einsetzen und als **Cockpit** speichern. In den ersten Zeilen den Setup-Code und die veröffentlichte PWA-Adresse einsetzen. **▶︎** antippen und jede Vorschau prüfen.
3. **Widgets platzieren und testen.** Home-Bildschirm gedrückt halten → **Bearbeiten → Widget hinzufügen → Scriptable**. Für jede der drei Grössen **Widget bearbeiten → Script → Cockpit** wählen. Sperrbildschirm gedrückt halten → **Anpassen → Sperrbildschirm → Widgets hinzufügen → Scriptable**, rechteckige Grösse wählen und das Skript zuweisen. In Hell/Dunkel und per Antippen prüfen. Für den Cache-Test in den Flugmodus wechseln, WLAN ausschalten und die Scriptable-Vorschau öffnen.
4. **Kurzbefehl auf dem iPad teilweise geprüft.** Diktat und erzeugtes To-do bestätigt. In **Mitteilung anzeigen** die Ausgabe der Aktion **Wert für `message` in Data abrufen** als Text einsetzen und erneut testen. Für den Sprachstart «Hey Siri, Cockpit» sagen. Optional auf dem iPhone **Einstellungen → Bedienungshilfen → Tippen → Auf Rückseite tippen → Doppeltippen oder Dreimal tippen → Cockpit** wählen.
5. **Bestehende Standort-Automation kontrollieren.** Im Sheet **log** am Folgetag auf **location updated** um ca. 06:00 prüfen. Details in [Abschnitt 5](SETUP-iOS.md#5-bestehende-automation-standort-fürs-briefing-nachschlagen).

### Prüfung durch Claude Code (15.11.)
- Codex-Arbeit geprüft: Widget-Tests 10/10, Web-Typprüfung grün, keine Schlüssel oder persönlichen Daten im Skript (Setup-Code und PWA-Adresse sind leere Konstanten), Abruf per POST `text/plain` wie vertraglich vorgesehen.
- `getWidget` liefert `week` (D21-Folge, OPEN-QUESTIONS.md). Kalender-Lesebereich ab Montag dieser Woche (`calendarRange`), behebt fehlende Wochenanfangs-Termine in der PWA-Wochenansicht. 118 Backend-Tests, `npm run e2e` 23/23.
- `SETUP-iOS.md` nachgeführt: Adresse der Webseite und der Raw-Datei konkret angegeben, `shortcutSetup` in der Datei **gas/weather.gs**, Hinweis zur Wochenagenda entfernt.
- GitHub Pages ist öffentlich erreichbar (HTTP 200). Die Briefing-Korrektur von Codex ist mit diesem Push live.

## Erweiterung: Schnellerfassung mit mehreren Einträgen, kurze Titel (2026-11-15 abends, Claude Code)

### Erledigt
- `capture` zerlegt einen Satz in bis zu 3 Einträge (D23). Live mit `dryRun` geprüft (Deployment @22):
  - «Ich habe morgen um 9:00 Uhr ein Meeting und muss dafür heute Abend noch neue Schuhe kaufen» → «Termin eingetragen: Meeting, Mo 16.11. 09:00–10:00» + «To-do erfasst: Neue Schuhe kaufen, fällig So 15.11.» (zweimal gleich; ein erster Aufruf direkt nach dem Deployment fiel auf die Regel zurück, siehe Mängel).
  - «ich sollte unbedingt noch bis Freitag die Python Übung fertig machen weil sonst gibt es Abzug» → «Python Übung fertig machen, fällig Fr 20.11.» (gekürzt, Umlaut korrekt).
  - «Zahnarzt Dienstag 15 Uhr» und «Velo flicken nächste Woche» bleiben je ein Eintrag.
  - «Prüfung Statistik am 3. Dezember, vorher Zusammenfassung schreiben» → ganztägiger Termin + To-do.
- Echter Schreibtest: zwei To-dos aus einem Satz, derselbe Aufruf mit derselben `id` zweimal → dieselben IDs, nichts doppelt; Testeinträge gelöscht. `npm run e2e` 23/23, 123 Backend-Tests.
- Der Siri-Kurzbefehl sollte **keine** Änderung brauchen: `data.message` enthält eine Zeile pro Eintrag. Auf dem Gerät noch zu prüfen (Nutzer-Schritt unten), zusammen mit der offenen Mitteilungsanzeige aus Phase 3 (dort muss die Variable aus **Wörterbuchwert abrufen** mit Schlüssel `message` stehen, nicht `data`).
- Ein fehlgeschlagener oder unbrauchbarer KI-Aufruf wird in `capture` einmal wiederholt (Deployment @23). Vorher fiel der Beispielsatz in ca. 1 von 7 Aufrufen auf «ganzer Satz als To-do» zurück; danach 8 von 8 korrekt.

### Manuelle Schritte für den Nutzer
1. Siri-Kurzbefehl «Cockpit» starten und diktieren: «Ich habe morgen um 9 Uhr ein Meeting und muss dafür heute Abend noch neue Schuhe kaufen». Erwartet: Mitteilung mit zwei Zeilen («Termin eingetragen: Meeting …», «To-do erfasst: Neue Schuhe kaufen …»), Termin im Google-Kalender, To-do in der PWA. Danach beide Testeinträge löschen.
2. Zeigt die Mitteilung `{…}` mit vielen Feldern statt zwei Zeilen: Kurzbefehl öffnen, in **Mitteilung anzeigen** die Variable antippen und die Ausgabe der zweiten Aktion **Wörterbuchwert abrufen** (Schlüssel `message`) wählen.
- Kalender wird bis +42 Tage gelesen (für die Monatsansicht der PWA).
- Tick misst seine Laufzeit pro Tag (Script Property `TICK_STATS`); beim Tageswechsel schreibt er eine Log-Zeile «runtime <Datum>: <n> runs, <x> min» (für die Phase-4-Messung).

### Bekannte Mängel
- Fällt der KI-Aufruf aus (z. B. kurzzeitig nach einem Deployment oder bei Kontingentgrenze), wird der ganze Satz wie bisher zu einem To-do. Einmal beobachtet, danach nicht mehr.
- Ob ein Satz in mehrere Einträge zerfällt, entscheidet die KI. Bei mehreren Einträgen setzt die Regel für ungenaue Daten kein gemeinsames Datum (sonst bekäme jeder Eintrag dasselbe).

## Übergabe an Codex (Runde 3b, Stand 2026-11-15)

Wünsche des Nutzers vom 15.11. zur PWA. Backend und Vertrag sind bereit (Deployment @22, `shared/api-types.ts`, SPEC §3.3, D23).

1. **Kalender:** Im Dashboard-Modus ganz **rechts** (Spaltenreihenfolge Heute | To-dos + Mails | Kalender). Standardansicht nur **7 Tage ab heute**, keine vergangenen Tage. Ein Knopf «Monat» klappt eine **Monatsansicht** auf (Raster Mo–So, Monat vor/zurück; Termine gibt es bis +42 Tage). Empfehlung: als Überlagerung über dem Inhalt (Sheet/Dialog, schliessbar mit Esc und ×) statt die Spalten umzubauen; auf dem iPhone als Vollbild-Sheet. Die Wahl zwischen Überlagerung und Verschieben liegt bei Codex, Hauptsache einfach und robust.
2. **Seite kürzer:** Der Kopfbereich hat viel leere Fläche. Kompakter machen (eine Zeile mit Titel, Status und Aktualisieren), Abstände straffen, damit auf dem PC alles Wichtige ohne langes Scrollen sichtbar ist. Gilt auch für iPad und iPhone sinngemäss.
3. **Schnellerfassung über `capture`:** Die PWA parst heute lokal (chrono) und sendet `todo.add` mit dem ganzen Text als Titel. Neu: `capture` mit `{text, id}` senden (Client-UUID, über die Outbox wiederholbar, idempotent). Die Antwort enthält `items` (To-dos und/oder Termine) und `message` → als kurze Bestätigung anzeigen, danach den State neu laden. Nicht optimistisch eintragen (die KI bestimmt Titel, Typ und Datum). Die lokale Datumsvorschau darf bleiben, Hinweis «wird beim Speichern zusammengefasst». Offline: in die Outbox; scheitert `capture` endgültig, nichts verlieren (Text behalten). Kein `dryRun` pro Tastendruck (Gemini-Kontingent).
4. Tests und Build wie gewohnt; STATUS nachführen. Danach übernimmt Claude Code Phase 4 (E2E, Schlüsselrotation, BETRIEB.md).

**Prompt für Codex (vom Nutzer einzufügen):** «Lies AGENTS.md, docs/STATUS.md Abschnitt ‹Übergabe an Codex (Runde 3b)›, docs/SPEC.md §3.3 und docs/DECISIONS.md D23. Setze die drei Punkte in web/ um, ändere nichts in backend/ oder shared/. Teste, committe und führe STATUS nach.»

## Phase 4 – Integration und Abnahme (begonnen 2026-11-15, Claude Code)

### Erledigt
- **Sicherheitsprüfung Repo und Git-Historie** (alle Commits, alle Branches): Abgleich gegen alle Werte aus `backend/.env.local`, `backend/src/private.local.js`, die Mailadressen in `private/PERSOENLICH.md`, Wohn- und Schulort sowie Muster für Google-API-Schlüssel, Telegram-Token, Deployment-IDs, ntfy-Topics und private Schlüssel. Ergebnis: keine Schlüssel, Tokens, Deployment-IDs, Web-App-URL, Koordinaten oder Adressen, weder im aktuellen Stand noch in der Historie. Treffer nur bei allgemeinen Wörtern (Kategorie-IDs, Farbcodes, «from»). Zusätzlich alle 157 Wörter ab 5 Zeichen aus `private/PERSOENLICH.md` gegen Repo und Historie geprüft: Überschneidungen sind nur allgemeine Begriffe (z. B. «Python», «Krankenkasse», «Stundenplan»); einziger identifizierender Treffer ist Befund 1.
  - Befund 1 (behoben): Kurzname der Hochschule in STATUS.md (seit Commit `48a9293`). Im aktuellen Stand ersetzt; **in der Historie bleibt er**, siehe offene Entscheide.
  - Befund 2 (bekannt seit Phase 0): Die ersten zwei Commits tragen den Vornamen als Autorname.
- **Eingabevalidierung:** Alle Aktionen haben Validatoren (`src/lib/api.js`), `npm run e2e` prüft falschen Schlüssel, kaputtes JSON und fehlende Felder (23/23).
- Laufzeitmessung des Triggers vorbereitet (siehe oben, ab Deployment @22).
- **Codex-Runde 3b geprüft und gepusht** (Commit `419ce07`): 60 Web-Tests, Typprüfung und Build grün, keine Schlüssel oder persönlichen Daten im Diff. GitHub Pages ausgeliefert, das Live-Bundle entspricht dem lokalen Build.
- **E2E-Test der PWA gegen das echte Backend** (Chromium, 1440×900, live auf GitHub Pages, Setup-Code eingesetzt): Dashboard-Spalten «Heute | To-dos | Nächste 7 Tage», Knopf «Monat» vorhanden. Schnellerfassung «Ich muss heute noch unbedingt das Velo putzen und bis Samstag den Keller aufräumen» → nach 5 s Bestätigung mit zwei Zeilen, «Velo putzen» sofort in der Liste, beide To-dos im Backend; Testeinträge gelöscht. Seitenhöhe am PC noch ca. 1540 px bei 900 px Fensterhöhe (Mails und «Am Horizont» unterhalb), gegenüber vorher deutlich kürzer.
- Dabei gefunden und behoben (Deployment @25): Die KI schrieb «aufraumen» bzw. «aufrauemen». Die Umlaut-Korrektur vergleicht jetzt schreibweisenunabhängig mit dem Originaltext; danach 3 von 3 korrekt («Keller aufräumen»).
- Kleinigkeit an Codex (OPEN-QUESTIONS): Feldlänge 2000 statt 500 Zeichen.

### Offen
1. ~~Historie umschreiben~~ Vom Nutzer am 15.11. abgelehnt (Risiko gering), Historie bleibt.
2. **24-h-Messung:** Am 17.11. im Sheet `log` die Zeile «runtime 2026-11-16: …» lesen (erster voller Tag). Ziel < 45 Min. Zusätzlich möglich: Apps Script → **Ausführungen**.
3. ✔ End-to-End-Durchlauf (siehe Abnahme Phase 4), Schlüsselrotation vorerst nicht (D24), `docs/BETRIEB.md` geschrieben.
4. **Nutzer, Geräte-Abnahme Runde 3b:** PWA auf iPhone und iPad neu laden (App ganz schliessen und neu öffnen). Prüfen: Kalender zeigt 7 Tage ab heute, «Monat» öffnet die Monatsansicht, Schnellerfassung mit einem Satz aus Termin und Aufgabe zeigt die Bestätigung und trägt beides ein. Testeinträge danach löschen.
5. ✔ Alter Testeintrag vom Nutzer gelöscht.
6. Aus der Wetter-Erweiterung weiterhin offen: 16.11. **location updated** um ca. 06:00 im `log` (iPhone gesperrt) und das erste Wochentags-Briefing mit Wetter.

## Runde 3b – PWA optimiert (2026-11-15, Codex)

### Erledigt
- Dashboard: **Heute | To-dos + Mails | Kalender**. Genau sieben Tage ab heute in Europe/Zurich; Wochenenden nach Datum. Monatsdialog mit Mo–So-Raster, Navigation innerhalb des gelieferten +42-Tage-Bereichs, Escape, Schliessen und Fokus-Rückgabe. Auf dem iPhone Vollbild mit antippbaren Tagen, Eintragsanzahl und lesbarer Tagesagenda.
- Kompakter Kopfbereich und kleinere Kartenabstände. Im Dashboard sind überfällige und heute fällige Aufgaben sofort sichtbar; die übrigen stehen unter **Weitere Aufgaben**. Wichtige Mails erscheinen dadurch weiter oben.
- Schnellerfassung sendet `capture` mit Text und Client-UUID. Lokale Datumsvorschau bleibt ein Hinweis; keine optimistischen Einträge und keine Gemini-Vorschau-Anfragen. Bestätigte `items` werden übernommen, `message` mit Zeilenumbrüchen angezeigt, danach wird `getState` geladen.
- Offline-Eingaben bleiben in IndexedDB über Neustarts erhalten. Der erste Versand kann beliebig später erfolgen. Unbestätigte Aufrufe werden ab dem ersten Versand höchstens 15 Minuten lang mit derselben UUID wiederholt, deutlich kürzer als der bestmögliche 6-h-Cache. Danach bleiben Text und Hinweis unter **Einstellungen → Synchronisierung** erhalten. Endgültig abgelehnte Eingaben bleiben ebenfalls erhalten und blockieren andere Änderungen nicht. Bestätigte Ergebnisse werden vor der lokalen Übernahme gespeichert, damit lokale Speicherfehler keine erneute Serveranfrage erzwingen.
- Nur `web/` und dieser Status geändert; `backend/` und `shared/` unverändert.

### Prüfung
- `cd web; npm test`: **60 Tests grün**. Neue Fälle: Monats-/Jahresgrenzen, Schaltjahr, beide Zürcher Zeitumstellungen, Capture-UUID, verzögerter Erstversand, begrenzte Wiederholungen, erhaltener Fehlertext und gespeicherte Bestätigung.
- `cd web; npm run build`: TypeScript und Produktionsbuild grün.
- `node web/scripts/browser-check.mjs`: Chromium bei 375/834/1440 px, Hell/Dunkel, alle Ansichten ohne horizontalen Überlauf. Dashboard-Reihenfolge, sieben Tage ab heute, Monatsgrenzen, Dialogfokus/Escape, iPad-Seitenleiste und To-do-Editor geprüft. Produktions-Service-Worker, Offline-Neuladen und genau ein erfolgreicher Capture-Versand nach Wiederverbindung mit gemischter To-do-/Termin-Antwort geprüft. API-Antworten simuliert, keine echten Einträge erzeugt. Screenshots lokal unter `private/previews/` visuell geprüft.

### Manuelle Schritte für den Nutzer / Phase 4
1. Nach Veröffentlichung des Commits die PWA öffnen und **Aktualisieren** antippen; falls noch die alte Ansicht erscheint, App schliessen und erneut öffnen. Auf dem PC Kalender rechts und **Weitere Aufgaben** prüfen.
2. **Kalender → Monat** öffnen; auf dem iPhone einen Tag antippen und die Tagesagenda prüfen. Auf iPad/PC Monat vor/zurück sowie **×** bzw. Escape prüfen.
3. In der Schnellerfassung einen Testsatz mit Termin und Aufgabe speichern. Bestätigung mit zwei Zeilen und beide Einträge in PWA/Google-Kalender prüfen, danach Testeinträge löschen. Diesen Live-E2E-Test übernimmt Claude Code in Phase 4 gemeinsam mit dem Nutzer.
4. Bei einer fehlgeschlagenen Eingabe **Einstellungen → Synchronisierung → Gespeicherte Eingabe** öffnen und Text bei Bedarf markieren/kopieren. Zuerst Kalender und To-dos auf bereits erstellte Einträge prüfen, erst danach erneut erfassen oder **Änderung verwerfen** wählen.

### Offen / bekannte Grenzen
- Push/Veröffentlichung nicht ausgeführt. Echte iPhone-/iPad-Geräte und Live-KI bleiben im Phase-4-Durchlauf zu prüfen; Phase 4 ist nicht abgeschlossen.
- Doppelte Termine bleiben gemäss D23 nur bestmöglich abgesichert. Unklare oder endgültig abgelehnte Capture-Aufträge werden bewusst nicht über **Jetzt erneut versuchen** entsperrt; ihr Text bleibt zur manuellen Prüfung erhalten.
- Im Demo-Modus erzeugt die Schnellerfassung keine KI-Einträge; der Text bleibt mit Hinweis in der Outbox. Bei vielen Einträgen bleibt Scrollen erforderlich.

## D24 – Erinnerungen, Posteingang, Kalender und Web-App (2026-11-15 abends, Claude Code)

### Erledigt
- **To-do-Erinnerungen** per Telegram: mit Uhrzeit 120 Min. vorher; ohne Uhrzeit um 16:00 gesammelt «Heute noch offen», falls noch offen. Einstellbar im Sheet → `config` → `todoReminderLead` / `todoDayReminder` (leer = aus).
- **Posteingang aufräumen:** ab dem nächsten Backend-Lauf Modus `active` mit Archivieren. Nur ausdrücklich als Info/unwichtig bewertete Mails verlassen den Posteingang (mit Label); wichtige, sensible, unbewertete und Mails mit To-do bleiben. «War wichtig» holt eine Mail zurück.
- **Kalender:** Lektionen, Serien und Kalenderwochen klein und grau (Knopf «Stundenplan ausblenden»), Termine gefüllt, To-dos gestrichelt mit Kreis, Legende. PC 1440×900: ganze Woche ohne Scrollen sichtbar (vorher knapp 3 Tage). Monatsansicht ohne Lektionen.
- **Heute:** «Dein nächster Termin» ohne Lektionen, relative Zeit («morgen», «in 3 Std.»), «Heute noch 1 Termin · 2 Lektionen». ÖV-Karte zuunterst.
- **Mails:** nur wichtige sichtbar, «Infos (n)» aufklappbar; im Dashboard Text auf zwei Zeilen gekürzt.
- **To-dos:** Bearbeiten/Verschieben nebeneinander statt untereinander (Zeilen halb so hoch).
- Fix: `.sr-only` fehlte im CSS (Beschriftungen für Screenreader waren sichtbar bzw. ohne Wirkung).
- Tests: Backend 125, Web 61 (+ `relativeStart`), Build, `web/scripts/browser-check.mjs` (375/834/1440 px, hell/dunkel, Offline, Monatsansicht) bestanden; Check an D24 angepasst (Lektion nie als nächster Termin).
- Seitenhöhe PC 1549 → 1187 px.

### Manuelle Schritte für den Nutzer
1. Optional, bestehende Info-Mails einmalig aus dem Posteingang räumen: Sheet → **Erweiterungen → Apps Script** → Datei **gas/gmail.gs** → Funktion **archiveInfoMails** → **Ausführen**. Betrifft nur gespeicherte Mails der letzten 30 Tage mit Wichtigkeit ≤ 1 (nicht sensibel, ohne To-do). Danach im `log` «archiveInfoMails: n mail(s) archived».
2. Zurück zum alten Verhalten: Sheet → `config` → `mode` = `observe` (Posteingang wird nie verändert) oder `archiveAfterLabel` = `false` (nur Labels).
3. PWA auf iPhone/iPad ganz schliessen und neu öffnen, damit die neue Version lädt.

### Bekannte Mängel / Vorschläge
- Lektionstitel sind die Kurzcodes aus dem Stundenplan-Abo. Lesbare Namen wären über eine Zuordnungstabelle im Sheet möglich (nicht umgesetzt).
- Das Widget zeigt als nächsten Termin weiterhin auch Lektionen (bewusst unverändert, auf Wunsch anpassbar).

## D25 – Postfach, sensible Mails, Fächernamen, To-dos im Kalender (2026-11-15 abends, Claude Code)

### Erledigt
- **Postfach je Mail:** Backend erkennt das ursprüngliche Postfach (unterster `Delivered-To`, Schul-Domain in To/Cc, eigene Adresse über Gmail-Profil). Regeln in `config.mailAccounts` (Schule / Privat / Geschäftlich). Gespeicherte Mails nachgetragen: alle 10 = «Privat» (sie kamen direkt an die Hauptadresse, auch die ILIAS-Mail). Ob «Schule» und «Geschäftlich» stimmen, zeigt die erste weitergeleitete Mail.
- **Sensible Mails:** App zeigt Absender, Betreff und «Vertraulich · Kategorie», keine Zusammenfassung. Push und Widget bleiben generisch.
- **Fächernamen** aus dem Tab «Fächer Namen»: live geprüft, alle 58 Lektionen umbenannt (wirkt auch in Widget und Briefing).
- **Widget:** nächster Termin ohne Lektionen.
- **Kalender:** To-dos blau umrandet, antippen → Erledigt / Morgen / Nächste Woche / anderes Datum.
- **iPhone/iPad:** keine doppelten Überschriften mehr. «Am Horizont» mit Hinweis, wenn leer.
- Tests: Backend 128, Web 61, Browser-Prüfungen (375/834/1440 px, hell/dunkel, offline) bestanden. Deployment @28, GitHub Pages veröffentlicht.

## Abnahme Phase 4 (SPEC §6)

| Kriterium | Ergebnis |
|---|---|
| End-to-End-Durchlauf dokumentiert | ✔ Mail → Bewertung → Push (Phase 1b, echte Fristmail) · Mail → To-do (automatisch) · Siri «Cockpit» → Termin **und** To-do (Nutzer, 15.11.) · PWA-Schnellerfassung gegen das echte Backend (Chromium, 2 To-dos, Bestätigung nach 5 s) · To-do-Erinnerung «Heute noch offen» per Telegram empfangen (Nutzer, 15.11.) · Widget mit echter `getWidget`-Antwort (Phase 3) · `npm run e2e` 23/23 |
| Sicherheitsprüfung ohne offene Befunde | ✔ Repo und gesamte Git-Historie gegen alle privaten Werte, Wörter aus `PERSOENLICH.md` und Schlüsselmuster geprüft. Einziger Fund (Hochschul-Kurzname in STATUS) im aktuellen Stand entfernt; in der Historie belassen (Entscheid Nutzer). Eingabevalidierung aller Aktionen per E2E geprüft. Schlüsselrotation bewusst nicht (D24). |
| Trigger-Laufzeit über 24 h < 45 Min. | ⏳ Messung läuft seit 15.11. (`TICK_STATS`). Ergebnis am 17.11. im `log`: «runtime 2026-11-16: …». Nicht vor Abschluss prüfbar; Erwartung aus Einzelläufen deutlich darunter. |

**Nicht vor Abschluss prüfbar (läuft automatisch, Nutzer schaut nach):**
1. 16.11. ca. 06:00: `log` «location updated» bei gesperrtem iPhone; Briefing mit Wetter.
2. Erste Info-Mail: Label gesetzt, nicht mehr im Posteingang, kein «label failed» im `log`.
3. Erste weitergeleitete Mail (Schule/zweites Gmail): richtiges Postfach-Kennzeichen in der App.
4. 17.11.: Laufzeitzeile im `log` (< 45 Min.).

Weiteres Vorgehen: Der Nutzer testet eine Woche. Fehler oder Wünsche danach an Claude Code; Betriebsanleitung in `docs/BETRIEB.md`.

## D26 – Dashboard und Gestaltung (2026-11-15 spätabends, Claude Code)
- Dashboard: oben «Nächster Termin» (eine Zeile) + Schnellerfassung mit Bestätigungen; Kalender | Mails | To-dos; darunter Wetter, Am Horizont, Dein Morgen, Unterwegs. Datum neben dem Logo, «Dein Überblick» entfernt.
- Gestaltung vereinheitlicht (Tokens, Schriftskala, schlichte Knöpfe, Farbe nur mit Bedeutung), hell und dunkel.
- To-do-Gruppe «Nächste 7 Tage» statt «Diese Woche». Bestätigungen verschwinden nach 12 s.
- Geprüft: 61 Web-Tests, Build, `browser-check.mjs` (an D26 angepasst, inkl. «alle drei Spaltenköpfe ohne Scrollen sichtbar» bei 1440×900), Screenshots PC hell/dunkel, iPhone (Heute, To-do-Bearbeiten, Einstellungen, Einrichtung). Nicht geprüft: Safari auf iPhone/iPad (Nutzer).

## D27 – Wetter-Fix, Widget nach Vorlage, Fächer-Seite (2026-11-16, Claude Code)

### Ergebnis 1. Morgen (16.11.)
- ✔ Standort-Kurzbefehl lieferte um 06:00 bei gesperrtem iPhone («location updated»).
- ✘ Briefing ohne Wetter: Open-Meteo antwortete um 06:38 mit HTTP 429 für beide Orte (geteilte Google-IPs, wie bei ntfy). Behoben, siehe unten.

### Erledigt
- **Wetter:** Vorhersagen werden 6 h zwischengespeichert und ab 90 Min. vor dem Briefing bei jedem Lauf vorab geholt. Fehlt das Wetter trotzdem, wartet das Briefing bis zu 40 Min. und geht dann mit «Wetter zurzeit nicht abrufbar» hinaus. Das Log nennt jetzt den Grund der 429-Antwort.
- **Widget** wie die Vorlage: Karten «To-dos» (mit Anzahl, Fälligkeit rechts, überfällig rot), «Nächste Termine» (Balken; «Heute, 12:30», «Morgen, 09:00»; Prüfungen violett, Lektionen hellblau), «Wichtige neue Mails» (oranger Punkt, rot bei dringend). Hell/dunkel. Neue Parameter: `todos`, `termine`, `mails`, `ohne Lektionen`. Vorschau-Bilder: `private/previews/widget-light.png` und `widget-dark.png` (nur eine Annäherung, Schrift und Symbole weichen ab).
- **Fächer-Seite** in der Web-App: pro Fach Grundinfos (mit automatisch nächster Lektion und Prüfungs-Countdown), Links, offene To-dos, Termine/Prüfungen/Abgaben, Notizen (speichern sich selbst, auch offline). Knopf **Erfassen** für To-do, Termin, Prüfung oder Abgabe mit vorgewähltem Fach. iPhone: Tab «Fächer» (Einstellungen weiterhin über das Zahnrad oben rechts). PC/iPad quer: Umschalter **Cockpit | Fächer** oben in der Mitte.
- **Fach-Zuordnung:** Fächer = deine Schul-Kategorien. Termine bekommen ihr Fach über Stichwörter (Startwerte pro Fach); diese Startwerte stehen im neuen Sheet-Tab **faecher**. To-dos: das Fach-Etikett an jedem To-do antippen → anderes Fach wählen.
- Backend Deployment @32 (dieselbe ID). Live geprüft: Briefing-Vorschau heute und morgen mit Wetter; alle Lektionen haben ein Fach (Stichwort «ET +» ergänzt). Das Widget richtet sein Höhenbudget nach der Bildschirmgrösse (Apple-HIG-Tabelle, auch iPad). Tests: Backend 144, Web 67, Widgets 12, `npm run e2e` 29/29 (inkl. Notiz mit «=» am Anfang), `browser-check.mjs` bestanden (375/834/1440 px, hell/dunkel, Fächer-Seite, Offline).

### Manuelle Schritte für den Nutzer
1. **Morgen 17.11. ab ca. 06:40 prüfen:** Telegram-Briefing enthält wieder eine Wetterzeile. Im Sheet, Tab **log**: Stehen zwischen 05:00 und 06:30 Zeilen «Open-Meteo HTTP 429 (…)»? Wenn ja, den Text in Klammern an Claude melden (zeigt, welches Limit greift). «briefing waiting for weather» heisst: das Briefing hat auf Wetter gewartet.
2. **Widget-Skript ersetzen** (iPhone und iPad, je ca. 3 Min.):
   1. App **Scriptable** öffnen → Skript **Cockpit** antippen → oben die zwei Zeilen `const SETUP_CODE = "…";` und `const PWA_URL = "…";` markieren → **Kopieren** und z. B. in Notizen sichern (die werden beim Ersetzen überschrieben).
   2. In Safari `https://raw.githubusercontent.com/<GitHub-Benutzername>/cockpit/main/widgets/Cockpit.js` öffnen → ganzen Text markieren → **Kopieren**.
   3. Zurück in Scriptable: im Skript alles markieren → **Einsetzen**. Dann die zwei gesicherten Zeilen wieder oben einsetzen (die leeren Zeilen `const SETUP_CODE = "";` und `const PWA_URL = "";` ersetzen) → **Fertig**.
   4. **▶︎** antippen → **Gross** wählen und die Vorschau ansehen, dann **Mittel** und **Klein**.
   5. Optional: Widget gedrückt halten → **Widget bearbeiten** → **Parameter** z. B. `termine` oder `ohne Lektionen`.
   6. Bitte je einen Screenshot vom grossen Widget in **hell und dunkel** an Claude schicken, falls etwas abgeschnitten oder verschoben aussieht.
3. **Fächer-Stichwörter kontrollieren:** Sheet → Tab **faecher** → Spalte **stichworte**. Termine, deren Titel mit einem dieser Wörter beginnt, landen bei diesem Fach. Alternativ in der App: **Fächer** → Fach → **Grundinfos · Bearbeiten**. Fehlt bei «Termine» eine Lektion oder Prüfung, das passende Stichwort ergänzen.
4. **Web-App neu laden:** PWA ganz schliessen und neu öffnen (iPhone/iPad), am PC **Aktualisieren**. Dann **Fächer** öffnen, bei einem Fach einen ILIAS-Link hinzufügen und eine Notiz schreiben; auf einem zweiten Gerät prüfen, ob sie nach ca. 1 Min. dort erscheint.

### Bekannte Mängel / Hinweise
- Das Fach eines **Termins** lässt sich in der App nicht nachträglich ändern (nur über Stichwörter oder beim Erfassen). Bei Bedarf als nächster Schritt: Termin antippen → Fach wählen.
- Notizen sind Klartext (keine Fett-/Listen-Formatierung). Gleichzeitiges Bearbeiten auf zwei Geräten verliert nichts, setzt aber beide Fassungen untereinander.
- Die Widget-Vorschau auf dem PC ist eine Annäherung; massgebend ist die Darstellung auf dem Gerät.
- Ein Ordner `private/previews/` enthält Screenshots mit erfundenen Daten (nicht im Repo).

## D28 – Termine bearbeiten, Notizseiten, Widget im getönten Modus, HIG-Durchgang (2026-11-16, Claude Code)

### Erledigt
- **Widget:** Auf dem iPad mit Home-Bildschirm-Stil «Getönt» war es ein schwarzes Feld mit drei weissen Kästen: Deckende Karten verdeckten im getönten Modus ihren Text. Karten, Kacheln und Linien sind jetzt halbtransparent, die Symbole sind zentriert, und jede Karte hat eine feste Breite (kein Text mehr über dem Rand). Vorschau inkl. Simulation «getönt»: `node widgets/preview.mjs` → `private/previews/widget-tinted.png`.
- **Termine nachträglich ändern:** Termin antippen (Kalender, Fächer → Termine) → Titel, Datum, ganztägig/Uhrzeit, Ort, bei Prüfungen die Art, Fach; Löschen mit Rückfrage. Lektionen, Serientermine und abonnierte Kalender: nur das Fach (gilt für die ganze Serie). To-dos: wie bisher alles über den Stift, neu auch im Kalender über «Bearbeiten».
- **Notizseiten pro Fach** (z. B. eine pro Lektion) mit Formatierung: Stile, Schriftgrösse, fett/kursiv/unterstrichen/durchgestrichen, Farben und Markierungen, Listen, Checklisten zum Abhaken, Tabellen, Bilder aus der Fotomediathek (auch Einfügen und Ziehen), Formeln (LaTeX), Links, Merksatz, Trennlinie, Datum, Rückgängig. Die bisherigen Notizen werden beim nächsten Lauf automatisch zur Seite «Notizen».
- **Web-App (HIG):** einheitliche Kartentitel, grössere Nebentexte, mehr Abstand unter der iPad-Statusleiste in der Home-Bildschirm-App.
- Tests: Backend 154, Web 71, Widget 12; Browser-Prüfung `web/scripts/browser-check.mjs` und neu `web/scripts/notes-check.mjs` (Editor, Speichern über Neuladen, Termin- und To-do-Bearbeitung) und `web/scripts/editor-probe.mjs` (Checkliste endet mit zweimal Enter) grün; Live-Test `backend/scripts/e2e.sh` gegen @34: 39/39 (Notizseiten, Termin ändern inkl. Datum hin und zurück, Bild ohne Freigabe = klare Ablehnung). Migration live geprüft: die bisherigen Notizen sind jetzt die Seite «Notizen».

### Manuelle Schritte für den Nutzer
1. **Widget-Skript ersetzen (iPhone und iPad):** In Scriptable das Skript **Cockpit** öffnen → die zwei Zeilen `const SETUP_CODE = …` und `const PWA_URL = …` kopieren und in einer Notiz sichern → den ganzen Inhalt durch `widgets/Cockpit.js` aus dem Repo ersetzen → die zwei gesicherten Zeilen wieder oben einsetzen → **Fertig**. Das Widget aktualisiert sich innert 15 Min.; sofort: Widget lange drücken → **Widget bearbeiten** → ausserhalb tippen.
2. **Screenshot «getönt»:** Auf dem iPad einen Screenshot vom grossen Widget machen und in den Chat einfügen (in Claude Code: Bild in das Terminalfenster ziehen) oder unter `private/screenshots/` ablegen.
3. **Web-App neu laden** (auf dem iPad die App schliessen und neu öffnen) → **Fächer** → ein Fach → **Notizen** → «Neue Seite». Einen Termin im Kalender antippen und z. B. den Ort ändern.
4. ~~Bilder freischalten~~ – erledigt am 16.11. (Drive-API als Dienst eingetragen, Zustimmung erteilt, Backend @35, e2e 40/40 inkl. image.add/image.get). Bereits eingefügte Bilder laden beim nächsten Synchronisieren hoch (sonst Einstellungen → Synchronisierung → «Jetzt erneut versuchen»).

### Bekannte Mängel / Grenzen
- Titel und Zeit von Serienterminen und Lektionen nur im Kalender selbst änderbar (Cockpit: nur das Fach). Ebenso Einladungen anderer Personen und die Daten mehrtägiger Termine.
- Eine Notizseite fasst höchstens 45 000 Zeichen HTML (Hinweis ab 85 %). Für eine neue Lektion eine neue Seite beginnen.
- Gelöschte Bilder und Seiten: Die Bilddateien bleiben im Drive-Ordner (Aufräumen von Hand möglich).
- HIG-Auditor-Skill ist seit dem Neustart am 16.11. aktiv; Widget-Symbole damit nachkorrigiert (feste Abstände statt flexibler).

## D29 – HIG-Audit Web-App, Widget, Bilder freigeschaltet (2026-11-16, Claude Code)

### Erledigt
- Widget: Symbole und To-do-Kreis zentriert (auf dem iPad bestätigt).
- Bilder: Drive-API eingeschaltet, Zustimmung erteilt, Backend @35, e2e 40/40 inkl. Bild speichern/laden.
- Web-App nach HIG-Skill überarbeitet (Details DECISIONS D29). Tests: Web 71, browser-check und notes-check grün.

### Manuelle Schritte für den Nutzer
1. Cockpit auf iPhone und iPad einmal schliessen und neu öffnen (lädt die neue Version), dann Ansichten To-dos und Mails ansehen.

### Bekannte Mängel / nicht prüfbar
- Sichere Bereiche, Kopfband unter der Statusleiste und die Schriftgrössen-Einstellung von iOS lassen sich nur auf dem Gerät prüfen.
- «Dein Morgen» (Briefing) ist weiterhin ein Fliesstext; Vorschläge für eine schönere Darstellung siehe Antwort vom 16.11.
