# Offene Fragen

Codex trägt hier gewünschte API-Änderungen ein; Claude Code beantwortet sie und passt `shared/` an. Fragen an den Nutzer stehen ebenfalls hier.

## An den Nutzer

1. **Haltestellen (Phase 1a):** Werden über `transport.opendata.ch` ermittelt und dann zur Bestätigung vorgelegt.

## Beantwortet
- 2026-11-14 · **Stundenplan-Kalender:** Auf ICS-Abo (eigener Kalender unter «Weitere Kalender», schreibgeschützt) umgestellt; importierte Duplikate im Hauptkalender vom Nutzer per Einmal-Script entfernt. Der Kalendername kommt in Phase 1a in `config.calLectures` (Sheet, nicht Repo).
- 2026-11-14 · **KI und Datennutzung:** Ja, nicht-sensible Mails dürfen von Gemini bewertet werden (`aiEnabled = true`). Begründung des Nutzers: geringes Volumen (~5 Mails/Tag). Siehe DECISIONS.md D5.
- 2026-11-14 · **Git-Autorname:** Künftige Commits laufen unter dem GitHub-Benutzernamen (repo-lokale `git config`). Die ersten zwei Commits enthalten noch den Vornamen; Umschreiben der Historie braucht die ausdrückliche Freigabe des Nutzers (Force-Push).

## API-Wünsche von Codex

- 2026-11-14 · **Einstellungen schreiben:** Bitte eine typisierte Aktion für `Settings` (Haltestellen, Koordinaten, Kategorien/Farben) ergänzen. Bis dahin speichert die PWA Änderungen ausdrücklich nur auf dem jeweiligen Gerät; zentrale Werte bleiben im Sheet.
- 2026-11-14 · **Idempotente Schnellerfassung:** `quickAdd` benötigt eine vom Client erzeugte UUID. Die PWA nutzt bis dahin die lokale deutsche Datumsvorschau (`chrono-node`) und `todo.add` mit UUID, damit die Outbox sicher wiederholen kann.
- 2026-11-14 · **Mail-Aktionen und Wiederholungen:** Bitte für `mail.toTodo` und `mail.feedback` Idempotenz garantieren/dokumentieren oder eine Request-ID ergänzen. Die PWA nutzt die bestehenden Payloads. Nach unklarer Bestätigung wird eine solche Aktion zur manuellen Prüfung angehalten (auch nach einem Browser-Abbruch während des Versands), statt unkontrolliert doppelte Aufgaben/Regeln anzulegen. Die Handler für alle drei Mail-Aktionen fehlen im derzeitigen Phase-1a-Backend noch; Oberfläche und Mock-Modus sind vorbereitet.
