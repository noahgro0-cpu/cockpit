# Status

Stand: 2026-11-14 · Phase 1a abgeschlossen (ein Punkt wartet auf Bestätigung durch den Nutzer, siehe unten)

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
| `setup()` zweimal ohne Schaden | ⏳ vom Nutzer zweimal ausgeführt; Kontrolle im Sheet durch den Nutzer ausstehend (manuelle Schritte 1–2) |
| `ping`, `getState`, alle `todo.*`, `event.add` per curl gegen die echte Web-App | ✔ 23/23 (`cd backend && npm run e2e`), inkl. Idempotenz und Cache-Invalidierung |
| falscher Schlüssel, kaputtes JSON → saubere Fehlerantwort | ✔ `unauthorized` bzw. `bad_request`, immer JSON; GET liefert ebenfalls JSON |
| Kalender der nächsten 21 Tage im State | ✔ 36 Termine (33 Lektionen mit Raum, 3 private), Zeitraum gestern bis +21 Tage, keine Duplikate, Offset `+01:00` |

Zusätzlich geprüft: Die Antwort trägt `Access-Control-Allow-Origin: *`, `text/plain` ohne eigene Header funktioniert (D7). Umlaute, Sonderzeichen und Emojis kommen unverändert durch. Hinweis für Tests unter Windows: den Body per stdin an curl geben (`--data-binary @-`), nicht als Argument, sonst verfälscht Windows die Umlaute.

Ein echter Browser-Test (CORS aus einer Web-Seite) folgt in Phase 2 mit der PWA.

## Manuelle Schritte für den Nutzer
1. In der Tabelle **Cockpit** das Blatt **config** öffnen: Jeder Schlüssel (z. B. `mode`, `aiModel`) darf nur **einmal** vorkommen. Die Blätter `todos`, `mails`, `regeln`, `config`, `log` gibt es je genau einmal.
2. Im Script-Editor links auf das **Wecker-Symbol (Trigger)** klicken: Es darf genau **ein** Trigger `tick` («Zeitgesteuert», alle 10 Minuten) stehen.
3. In Google Kalender im Prüfungs-Kalender den Testtermin **«Cockpit-Test Pruefung (bitte loeschen)»** am **Fr 8.1.2027** öffnen → **Löschen** (Papierkorb-Symbol).

## Offen / nächste Schritte
- Phase 1b: Mail-Pipeline (Regeln, Gemini, To-dos aus Mails, Labels), ntfy-Push, Erinnerungen, Briefing, KI-Schnellerfassung.
- Vorbereitung durch den Nutzer für Phase 1b: Gemini-API-Schlüssel in AI Studio und ntfy-App auf dem iPhone (Anleitung folgt mit Phase 1b).

## Bekannte Mängel
- `quickAdd` legt bis Phase 1b nur ein To-do mit dem ganzen Text als Titel an und ist bei Wiederholungen nicht idempotent (Payload hat keine id).
- Die ersten zwei Commits tragen noch den Vornamen als Autor (siehe OPEN-QUESTIONS.md).
