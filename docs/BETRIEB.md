# Betrieb – Cockpit im Alltag

Diese Anleitung erklärt, was automatisch läuft, wo du etwas einstellst und was bei Störungen zu tun ist. Persönliche Werte (Adressen, Schlüssel, Kalendernamen) stehen nur im Google Sheet, in den Script Properties oder in `private/`, nie hier.

## 1. Was läuft wo

| Teil | Wo | Aufgabe |
|---|---|---|
| Backend | Google Apps Script, an das Cockpit-Sheet gebunden | Alle 10 Min.: Mails lesen und bewerten, To-dos erzeugen, Erinnerungen und Briefing senden, Posteingang aufräumen. Dazu die JSON-API für App, Widgets und Kurzbefehle. |
| Daten | Google Sheet (Tabs `config`, `todos`, `mails`, `regeln`, `log`, «Fächer Namen») | Einstellungen, To-dos, bewertete Mails, Regeln, Protokoll |
| Web-App (PWA) | GitHub Pages | Eine App für iPhone, iPad und PC. Wird bei jedem Push auf `main` neu veröffentlicht. |
| Widgets | Scriptable auf iPhone/iPad | Holen `getWidget` vom Backend |
| Kurzbefehle | iOS | «Cockpit» (Siri, To-do/Termin erfassen) und die Automation «Standort fürs Briefing» (06:00) |
| Push | Telegram (Reserve: ntfy) | Dringende Mails, To-do-Erinnerungen, «Heute noch offen», Briefing, Störungsmeldung |
| KI | Gemini (Gratis-Kontingent) | Mails bewerten, Schnellerfassung zerlegen. Mit Regel-Fallback, nie für sensible Mails. |

Kosten: 0 CHF. Grenzen: Apps Script 90 Min. Trigger-Laufzeit pro Tag, Gemini-Gratiskontingent (bei Überschreitung arbeitet das Backend mit Regeln weiter, Status «limited»).

## 2. Was automatisch passiert

| Wann | Was |
|---|---|
| alle 10 Min. | Neue Mails: Regeln → KI → Kategorie-Label in Gmail. Unwichtige/Info-Mails verlassen den Posteingang (nicht sensible, nicht ohne Bewertung, nicht mit To-do). Mails mit Handlung und Frist werden zu To-dos. |
| sofort | Push bei **dringenden** Mails (Handlung mit Frist oder spürbarer Folge) und bei Absendern mit `push = ja` in `regeln`. Während der Ruhezeit (`quietFrom`–`quietTo`) wird gesammelt und danach gesendet. |
| 06:00 (iPhone) | Standort-Automation meldet den Ort (gilt 12 h fürs Briefing-Wetter) |
| `briefingWeekday` / `briefingWeekend` | Morgen-Briefing: Termine, fällige To-dos, wichtige Mails, Wetter mit Kleidungsempfehlung |
| 120 Min. vor einem To-do mit Uhrzeit | Erinnerung (`todoReminderLead`) |
| `todoDayReminder` (16:00) | «Heute noch offen» für heute fällige To-dos ohne Uhrzeit |
| nach Mitternacht | Log-Zeile «runtime <Datum>: n runs, x min» (Laufzeit des Vortags) |
| täglich | Aufräumen: Mails älter als `mailRetentionDays` (30) aus dem Sheet entfernen, Log kürzen |

## 3. Einstellungen (Sheet → Tab `config`)

Werte in Spalte B ändern, wirksam spätestens beim nächsten Lauf. Die wichtigsten:

| Schlüssel | Bedeutung |
|---|---|
| `mode` | `active` = Gmail-Labels setzen und aufräumen; `observe` = Posteingang nie verändern |
| `archiveAfterLabel` | `true` = Info/unwichtig aus dem Posteingang; `false` = nur Labels |
| `quietFrom`, `quietTo` | Ruhezeit für Mail-Push |
| `briefingWeekday`, `briefingWeekend` | Briefing-Zeit (HH:MM) |
| `todoReminderLead` | Minuten vor einem To-do mit Uhrzeit (Standard 120) |
| `todoDayReminder` | Uhrzeit für «Heute noch offen» (leer = aus) |
| `aiEnabled` | `false` = keine KI, nur Regeln |
| `pushChannels` | `auto`, `telegram`, `ntfy` oder z. B. `telegram,ntfy` |
| `calLectures`, `calExams`, `calCapture`, `calRoutine` | Kalendernamen: Stundenplan, Prüfungen, Ziel für Siri-Termine, gedämpft angezeigte Kalender |
| `mailAccounts` | Postfach-Kennzeichen, z. B. `[["Schule","domain"],["Privat","@me"],["Geschäftlich","*"]]` |
| `weatherInBriefing` | `false` = Briefing ohne Wetter |

Weitere Tabs:
- **`regeln`**: Absender- oder Betreffregeln (oberste passende gilt). Spalte `sensibel = ja` hält Mails von der KI fern, `push = ja` meldet jede Mail dieses Absenders sofort. «War wichtig/unwichtig» in der App legt hier Regeln an.
- **«Fächer Namen»**: Spalte A Stundenplan-Titel (oder ein Teil davon), Spalte B Anzeigename.
- **`log`**: Protokoll (Fehler, «location updated», «runtime …», Archivierung).

## 4. Kontrolle und Störungen

**Läuft alles?** In der App oben «Verbunden». Bei veraltetem Stand erscheint ein Hinweis. Fallen drei Läufe in Folge aus, kommt eine Push-Nachricht «Backend-Störung» (höchstens alle 6 h).

| Problem | Prüfen / Lösung |
|---|---|
| Kein Push mehr | `log` nach `notify`/`telegram` durchsuchen. `pushChannels` prüfen. Telegram-Chat nicht stummgeschaltet? |
| Kein Briefing | `log` am Morgen; `briefingWeekday`/`-Weekend` gesetzt? Das Briefing wird nicht nachgeholt, wenn das Backend über 3 h aus war (steht dann nur in der App). |
| Mails werden nicht bewertet (alle «Info», keine Zusammenfassung) | `log` nach «Gemini call failed» durchsuchen: «rate limited» = Gratis-Kontingent erschöpft, erholt sich von selbst; unbewertete Mails werden bis zu 3× nachbewertet. `aiEnabled = true`? |
| Wichtige Mail fehlt im Posteingang | In Gmail unter ihrem Label suchen, in der App «War wichtig» tippen (holt sie zurück und merkt sich den Absender). |
| Siri-Kurzbefehl meldet Fehler | Internet? Schlüssel im Kurzbefehl aktuell? Bei «unauthorized» nach einer Schlüsselrotation den neuen Wert eintragen. |
| Widget zeigt alten Stand | Scriptable öffnen und Skript einmal ausführen; iOS aktualisiert Widgets nach eigenem Takt. |
| Wetter im Briefing am falschen Ort | `log` um 06:00 auf «location updated» prüfen; Ortungsdienste für Kurzbefehle «Immer». Ohne Standort gilt der Wohnort. |
| App zeigt keine neuen Funktionen | App ganz schliessen und neu öffnen (neue Version wird beim Start geladen). |

Vorübergehend alles anhalten: Apps Script → **Trigger** → den `tick`-Trigger löschen. Wieder einschalten: in **gas/setup.gs** die Funktion `setup` ausführen (legt den Trigger neu an, ändert keine Daten).

## 5. Wartung (für Claude Code / Entwicklung)

- **Backend ändern:** `cd backend; npm test` → `clasp push -f` → `clasp deploy -i <DEPLOYMENT_ID>` mit der ID aus `backend/.env.local`. Immer dieselbe ID, sonst ändert sich die Web-App-Adresse. Danach `npm run e2e` (Live-Test, legt Testdaten an und löscht sie).
- **Neue Config-Schlüssel / einmalige Umstellungen:** über `SCHEMA_VERSION` in `gas/tick.js`; der nächste Lauf ergänzt fehlende Schlüssel, ohne bestehende Werte zu überschreiben.
- **Web-App ändern:** `cd web; npm test; npm run build`, lokal mit `vite preview` (Port 4173) und Mock-Server (`VITE_MOCK=1`, Port 5174) `node scripts/browser-check.mjs` prüfen. Erst dann pushen, denn der Push veröffentlicht sofort.
- **Vor jedem Commit:** keine persönlichen Daten oder Schlüssel im Diff (Repo ist öffentlich).

### Schlüssel erneuern (nur bei Verdacht)
1. Apps Script → Datei **gas/setup.gs** → Funktion `rotateKey` → **Ausführen**.
2. Sheet → `config`: neue Werte in `setupCode`, `shortcutUrl`, `shortcutText`.
3. Eintragen: PWA auf jedem Gerät (Einstellungen → Verbindung neu einrichten → neuer Setup-Code), Scriptable (Setup-Code oben im Skript), Siri-Kurzbefehl «Cockpit» (`key`), Standort-Automation (Schlüssel im Text). Danach `shortcutUrl`/`shortcutText` im Sheet wieder löschen.

## 6. Datenschutz in Kürze

- Sensible Mails (Kategorien in `sensitiveCategories` oder Regel `sensibel = ja`) gehen nie an die KI; Push und Widget zeigen nur «Neue Mail» mit Kategorie, die App Absender und Betreff.
- Der Standort wird nur als letzter Wert, auf ~1 km gerundet, 12 h genutzt; das Log nennt keinen Ort.
- Nichts wird gelöscht: Mails werden höchstens archiviert (bleiben unter ihrem Label).
