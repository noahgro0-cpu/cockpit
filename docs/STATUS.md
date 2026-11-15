# Status

Stand 2026-11-15 · Phase 1b abgeschlossen; Erweiterung «Wetter im Briefing» ausgerollt (Abschnitt ganz unten), Kurzbefehl auf dem iPhone noch einzurichten. Phase 1a und 2 abgeschlossen. Nächste Phase: 3 (Codex).

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
   - Die HSLU-Regel hat absichtlich **keine** feste Wichtigkeit: So bewertet die KI Fristen und erzeugt To-dos. Mit einer festen 2 gäbe es aus HSLU-Mails keine automatischen To-dos.
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
