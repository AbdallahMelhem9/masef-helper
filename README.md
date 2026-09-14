# MASEF Helper

> **Deploy note (Render or similar)**: the app deploys with `AI_DISABLED=1` — course content, saved AI answers, glossary, and all reading modes work; asking new questions requires the local install (the AI runs through a local Claude subscription). The database seeds from `server/seed/masef-seed.db` (no user accounts inside — the first login on a fresh deploy creates the account, so log in right after deploying). Course PDFs are fetched from their original public sources at build time (`server/scripts/fetch-uploads.js`), not stored in this repository. With `render.yaml` present, deploy via Render → New → Blueprint → this repo.

Personal study app for the MASEF master's (Université Paris-Dauphine, 2026–2027).
Courses → lessons → teacher PDFs, where each PDF is decomposed into sections you can
read (transcribed with LaTeX), each with an AI lecture and its own chat box —
"a PDF you can chat with."

## Stack

- **Client**: Angular 20 (`client/`), KaTeX + marked for math rendering.
- **Server**: Node/Express (`server/`), SQLite via built-in `node:sqlite` (file: `server/data/masef.db`).
- **AI**: Claude Agent SDK using the local Claude Code **subscription login** — no API key.
  Requires the `claude` CLI to be installed and logged in on this machine.

## Run it

```powershell
./start-app.ps1        # starts the server (if needed) and opens http://localhost:3000
```

The server serves the built client. First visit creates your account (choose email + password).

## Development

```powershell
cd server; npm start          # API on :3000
cd client; npm start          # dev server on :4200, proxies /api to :3000
cd client; npm run build      # rebuild what :3000 serves
```

## How PDFs get ingested

Uploading a PDF to a lesson (UI: lesson page → Add PDF) automatically:
1. Claude reads the PDF and outlines it into sections (JSON).
2. Each section is transcribed to Markdown + LaTeX (faithful, not summarized).
3. Each section gets an AI "lecture" written under it (also regenerable in the UI).

The viewer polls while status is `processing` and fills in sections as they finish.
For a whole-course polycopié, `server/scripts/ingest-forien.js` shows the
chapter→lesson flow (one lesson per chapter, same PDF file).

Logs: `server/logs/*.log`.
