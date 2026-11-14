# Status

Stand: 2026-11-14 · Phase 0 abgeschlossen

## Erledigt (Phase 0)
- Werkzeuge geprüft: git 2.56, Node 26.13, npm 11.20, gh 2.104 (angemeldet, Scopes `repo`, `workflow`), clasp 3.4.1 (angemeldet, Apps Script API erreichbar).
- Git-Repo mit `.gitignore` (private/, ARBEITSPLAN.md, ANLEITUNG.md, .clasp.json, .env*, node_modules, dist) und Ordnerstruktur laut AGENTS.md.
- Alle «prüfen»-Punkte und Fallstricke §2.9 gegen die offizielle Doku geprüft; SPEC.md korrigiert; Begründungen in `docs/DECISIONS.md` (D1–D10). Wichtigste Änderungen:
  - Gmail über Advanced Service mit `gmail.modify` statt `GmailApp` (D2).
  - Gemini: `generateContent` bleibt, Modell `gemini-3.5-flash-lite`, Schema-Feld `responseJsonSchema` (D3, D4).
  - ntfy per JSON-Body statt Header (D6).
  - Stundenplan per ICS-Abo, `importTimetable()` entfällt (D8).
  - Abnahme Phase 2 ohne Lighthouse-PWA-Kategorie (D9).
- `shared/api-types.ts` (Vertrag) und `docs/mock-state.json` (frei erfunden, Referenzzeit Mo 16.11.2026 07:12) erstellt; `cd shared && npm test` prüft Typen und Mock (inkl. Gegenprobe mit absichtlich falschem Wert).
- Öffentliches GitHub-Repo `cockpit` angelegt, erster Commit gepusht.

## Abnahme Phase 0 (SPEC §6)
| Kriterium | Ergebnis |
|---|---|
| Repo-Struktur steht | ✔ backend/, shared/, web/, widgets/, docs/, .github/workflows/ |
| api-types.ts ↔ mock-state.json (Typprüfung) | ✔ `npm test` in `shared/` grün |
| «prüfen»-Punkte geklärt, in DECISIONS.md | ✔ D1–D10 |
| Keine persönlichen Daten im Repo | ✔ vor dem Commit per Suche geprüft (Namen, Orte, Module, Räume, Mail-Adresse, Schlüssel) |

Nicht abschliessend prüfbar in Phase 0: CORS-Verhalten der Web-App (nicht offiziell dokumentiert) → Browser-Test in Phase 1a. Gemini-Gratis-Limits stehen nur in AI Studio → beim Anlegen des Schlüssels ablesen.

## Offen / nächste Schritte
- Phase 1a: Backend-Grundgerüst (`setup()`, Sheet, API, Kalender).
- Fragen an den Nutzer: siehe `docs/OPEN-QUESTIONS.md`.

## Manuelle Schritte für den Nutzer
Für Phase 0 keine. Vorbereitung für Phase 1b (kann jetzt schon erledigt werden):
1. https://aistudio.google.com öffnen und mit dem Gmail-Konto anmelden.
2. Links auf **Get API key** klicken → **Create API key** → **Create API key in new project**.
3. Schlüssel kopieren und **nirgends ins Repo** legen; er wird in Phase 1a/1b in den Script Properties eingetragen (Anleitung folgt dann).
4. Auf der Seite **Rate limits** in AI Studio nachsehen, welche Limits für `gemini-3.5-flash-lite` angezeigt werden, und sie Claude mitteilen.

## Bekannte Mängel
- Keine.
