# Cockpit PWA

React, strict TypeScript, Vite, Tailwind and a generated offline service worker.
The domain and transport types are imported from `../shared/api-types.ts`.

## Development

Requires Node 22.12 or newer.

```powershell
cd web
npm ci
$env:VITE_MOCK = '1'
npm run dev
```

Open the local URL printed by Vite. Mock mode imports `../docs/mock-state.json`,
uses its reference date (16 November 2026, 07:12 Zurich), and does not call external
services. Transit and weather are explicitly labelled demo data. Mock IndexedDB
and settings are separate from live data. Remove `VITE_MOCK` to test setup:

```powershell
Remove-Item Env:VITE_MOCK
npm run dev
```

Only enter the setup code in the app, never in source files or build variables.
The URL-fragment variant is accepted and immediately removed from browser history.
The key is sent only in the POST body. Mail content is rendered as text, never HTML.
The service worker caches static application assets only; private state and the
outbox are stored in IndexedDB on the device. Connection details live in localStorage.

## Checks

```powershell
npm test
npm run build
npm run preview
```

Unit tests cover Zurich dates and DST, grouping, parsing, API envelopes and durable
outbox replay. Browser checks additionally need a mock dev server on port 5174,
a production preview on 4173, and Chromium:

```powershell
npx playwright install chromium
node scripts/browser-check.mjs
```

`CHECK_URL` and `MOCK_URL` override the local browser-check URLs. Screenshots use
fictional data only and are saved in ignored `private/previews/`.

`node scripts/backend-browser-check.mjs` optionally reads the existing ignored
`backend/.env.local` in memory, checks real browser CORS, ping/state and a temporary
todo lifecycle, and deletes that temporary todo in `finally`. It logs no credentials
or personal state. Do not run this against a different deployment without checking
the local configuration first.

## Offline behaviour and contract limits

- Persist each mutation before projecting it optimistically. Replay FIFO with bounded
  exponential backoff when visible and online; a Web Lock serializes tabs.
- `todo.add` retains its UUID. Conflicting `bad_request`/`not_found` writes are removed,
  a visible error is shown, and the fetched server state wins.
- Unauthorized or malformed responses pause the queue until retried or discarded.
- Mail creation/feedback have no idempotency token in the contract. They are marked
  uncertain before dispatch; an ambiguous response or interrupted send needs a
  manual server-state check before replay. This prevents automatic duplicates.
- Quick capture uses `chrono-node` German date preview and idempotent `todo.add`.
  It does not call the non-idempotent `quickAdd` endpoint.
- Settings are local overrides until a settings-write action exists. Mail actions
  require the Phase 1b backend handlers. See `docs/OPEN-QUESTIONS.md`.
- Public API caches throttle transit to 2 minutes and weather to 30 minutes,
  including failed attempts. Requests run only while visible. Weather attribution
  and transit source links are displayed with their cards.

## Deployment

`.github/workflows/pages.yml` tests and builds on pull requests and main; main deploys
the production build to GitHub Pages. Enable Settings → Pages → GitHub Actions first.
The workflow derives Vite's base path from the repository name and explicitly sets
`VITE_MOCK=0`. Local builds default to `/cockpit/`; `VITE_BASE` can override this.

Real iPhone/iPad installation, safe areas and keyboard behaviour must still be
checked on those devices. See `docs/STATUS.md` for the acceptance checklist.
