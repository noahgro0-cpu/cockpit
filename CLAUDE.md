@AGENTS.md

# Zusatz für Claude Code

- Du bist zuständig für alle Ordner (`backend/`, `shared/`, `web/`, `widgets/`), die Integration und die Schlussprüfung (seit 2026-11-15; vorher waren `web/` und `widgets/` bei Codex). Vor UI-Arbeit die Gestaltungsregeln in AGENTS.md beachten; Web-Änderungen lokal mit `vite preview` und `web/scripts/browser-check.mjs` prüfen, bevor sie gepusht werden (Push = Produktion).
- Vor Arbeiten an Apps Script, clasp oder der Gemini API die aktuelle offizielle Doku prüfen, wenn SPEC.md einen Punkt als «prüfen» markiert.
- Browser-Logins, Berechtigungsfreigaben und alles auf iPhone/iPad kann nur der Nutzer erledigen: solche Schritte nicht umgehen, sondern in `docs/STATUS.md` klickgenau beschreiben.
- Am Ende jeder Phase den Tokenverbrauch nennen (`/cost` bzw. `/usage`, sonst Schätzung).
