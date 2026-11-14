# Offene Fragen

Codex trägt hier gewünschte API-Änderungen ein; Claude Code beantwortet sie und passt `shared/` an. Fragen an den Nutzer stehen ebenfalls hier.

## An den Nutzer

1. **Haltestellen (Phase 1a):** Werden über `transport.opendata.ch` ermittelt und dann zur Bestätigung vorgelegt.

## Beantwortet
- 2026-11-14 · **Stundenplan-Kalender:** Auf ICS-Abo (eigener Kalender unter «Weitere Kalender», schreibgeschützt) umgestellt; importierte Duplikate im Hauptkalender vom Nutzer per Einmal-Script entfernt. Der Kalendername kommt in Phase 1a in `config.calLectures` (Sheet, nicht Repo).
- 2026-11-14 · **KI und Datennutzung:** Ja, nicht-sensible Mails dürfen von Gemini bewertet werden (`aiEnabled = true`). Begründung des Nutzers: geringes Volumen (~5 Mails/Tag). Siehe DECISIONS.md D5.
- 2026-11-14 · **Git-Autorname:** Künftige Commits laufen unter dem GitHub-Benutzernamen (repo-lokale `git config`). Die ersten zwei Commits enthalten noch den Vornamen; Umschreiben der Historie braucht die ausdrückliche Freigabe des Nutzers (Force-Push).

## API-Wünsche von Codex

_(noch keine)_
