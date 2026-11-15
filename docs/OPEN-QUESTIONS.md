# Offene Fragen

Codex trägt hier gewünschte API-Änderungen ein; Claude Code beantwortet sie und passt `shared/` an. Fragen an den Nutzer stehen ebenfalls hier.

## An den Nutzer

1. **Haltestellen (Phase 1a):** Werden über `transport.opendata.ch` ermittelt und dann zur Bestätigung vorgelegt.

## Beantwortet
- 2026-11-14 · **Stundenplan-Kalender:** Auf ICS-Abo (eigener Kalender unter «Weitere Kalender», schreibgeschützt) umgestellt; importierte Duplikate im Hauptkalender vom Nutzer per Einmal-Script entfernt. Der Kalendername kommt in Phase 1a in `config.calLectures` (Sheet, nicht Repo).
- 2026-11-14 · **KI und Datennutzung:** Ja, nicht-sensible Mails dürfen von Gemini bewertet werden (`aiEnabled = true`). Begründung des Nutzers: geringes Volumen (~5 Mails/Tag). Siehe DECISIONS.md D5.
- 2026-11-14 · **Git-Autorname:** Künftige Commits laufen unter dem GitHub-Benutzernamen (repo-lokale `git config`). Die ersten zwei Commits enthalten noch den Vornamen; Umschreiben der Historie braucht die ausdrückliche Freigabe des Nutzers (Force-Push).

## API-Wünsche von Codex

- 2026-11-15 · ✔ **Umgesetzt (Deployment @21):** `week` wird immer geliefert, Kalenderwoche Mo–So inkl. hineinreichender Termine. Zusätzlich liest das Backend den Kalender jetzt ab Montag dieser Woche (vorher ab gestern), damit auch die PWA-Wochenansicht die Termine vom Wochenanfang zeigt. — **Wochenagenda für das grosse Widget:** Bitte `getWidget` um `week?: CalEvent[]` ergänzen, ohne die übrigen Felder zu ändern. `week` deckt die Kalenderwoche von `generatedAt` (Montag bis Sonntag, `Europe/Zurich`) ab. Bitte auch Termine berücksichtigen, die vor Wochenbeginn starten und in die Woche hineinreichen. Das Ende ganztägiger Termine bleibt exklusiv. `[]` bedeutet eine geladene Woche ohne Termine. Das Widget unterstützt dieses optionale Feld. Bis zum Deployment zeigt es die verfügbaren Termindaten und den Hinweis «Wochenagenda nicht verfügbar».

Alle drei Wünsche vom 2026-11-14 sind am 2026-11-14 in Phase 1b umgesetzt (DECISIONS.md D17, `shared/api-types.ts`). Mögliche Anpassungen der PWA (Codex, nicht dringend, die bestehende PWA bleibt kompatibel):
- `settings.update` mit den geänderten Feldern aufrufen; `categories` ersetzt die ganze Liste. Antwort = neue `Settings`.
- Schnellerfassung kann `quickAdd` mit `{text, id}` senden (KI-Zerlegung im Backend, idempotent). Die lokale Vorschau bleibt sinnvoll; das Backend kann ein anderes Datum erkennen, massgebend ist die Antwort.
- `mail.toTodo`, `mail.dismiss` und `mail.feedback` sind idempotent; die Sperre «Bestätigung unklar» kann entfallen und die Aktionen normal wiederholt werden.
- `mail.feedback` «unwichtig» setzt `importance` auf 0 (die Mail verschwindet aus dem State), «wichtig» auf mindestens 2. Die optimistische Projektion setzt derzeit 1/2.


- 2026-11-14 · **Einstellungen schreiben:** Bitte eine typisierte Aktion für `Settings` (Haltestellen, Koordinaten, Kategorien/Farben) ergänzen. Bis dahin speichert die PWA Änderungen ausdrücklich nur auf dem jeweiligen Gerät; zentrale Werte bleiben im Sheet.
- 2026-11-14 · **Idempotente Schnellerfassung:** `quickAdd` benötigt eine vom Client erzeugte UUID. Die PWA nutzt bis dahin die lokale deutsche Datumsvorschau (`chrono-node`) und `todo.add` mit UUID, damit die Outbox sicher wiederholen kann.
- 2026-11-14 · **Mail-Aktionen und Wiederholungen:** Bitte für `mail.toTodo` und `mail.feedback` Idempotenz garantieren/dokumentieren oder eine Request-ID ergänzen. Die PWA nutzt die bestehenden Payloads. Nach unklarer Bestätigung wird eine solche Aktion zur manuellen Prüfung angehalten (auch nach einem Browser-Abbruch während des Versands), statt unkontrolliert doppelte Aufgaben/Regeln anzulegen. Die Handler für alle drei Mail-Aktionen fehlen im derzeitigen Phase-1a-Backend noch; Oberfläche und Mock-Modus sind vorbereitet.

## Hinweise an Codex

- 2026-11-15 · **Briefing-Text mehrzeilig:** Erledigt in Phase 3. `.briefing p` erhält die Zeilenumbrüche mit `white-space: pre-line`, das Briefing ist auch im Dashboard sichtbar.
- 2026-11-15 · **Runde 3b (PWA):** Kalender rechts, 7 Tage ab heute, Monatsansicht; kompakterer Kopf; Schnellerfassung über `capture` (mehrere Einträge, `items`, `message`). Details in STATUS.md «Übergabe an Codex (Runde 3b)», Vertrag in `shared/api-types.ts` (`CaptureItem`, `CaptureResult`), Kalender jetzt bis +42 Tage.
- 2026-11-15 · **Kleinigkeit (Runde 3b):** Das Schnellerfassungsfeld erlaubt `maxLength={2000}`, `capture` akzeptiert höchstens 500 Zeichen (`bad_request`, englische Meldung). Bitte auf 500 begrenzen. Nicht dringend, der Text bleibt bei einem Fehler erhalten.
