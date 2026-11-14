# Cockpit

Personal dashboard PWA: mails ranked by importance, to-dos (also generated from mails), 3-week calendar, public transport, weather and push notifications. Backend on Google Apps Script, frontend as a PWA on GitHub Pages, widgets via Scriptable.

- Specification: [`docs/SPEC.md`](docs/SPEC.md)
- Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Status: [`docs/STATUS.md`](docs/STATUS.md)
- API contract: [`shared/api-types.ts`](shared/api-types.ts) · mock data: [`docs/mock-state.json`](docs/mock-state.json)

This repository contains no personal data or secrets. Configuration lives in Apps Script properties, the bound Google Sheet and on the user's devices.
