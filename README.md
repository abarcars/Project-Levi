# Co‑Janet Sync (Project Levi)

This branch adds a small Co‑Janet sync server and a React UI page that shows sync controls.

What I added
- server/cojanet-sync-server.js — lightweight per-project sync server with client registration and SSE
- server/cojanet-sync-config.example.json — example memory seed/config
- src/lib/cojanetSyncClient.js — browser client helpers (register/pull/push/subscribe)
- src/context/CoJanetMemoryProvider.jsx — React provider that wires up subscription + sync helpers
- src/pages/CoJanetSyncPage.jsx — React page with controls: register, pull, push, sync now, memory preview
- package.json — minimal scripts for running server and dev (vite)

Quick start
1. Install deps:

   npm install

2. Start the server (set an admin token):

   export COJANET_SYNC_TOKEN="a-long-secret"
   export COJANET_ALLOWED_ORIGIN="http://localhost:5173"
   npm run start-server

3. Start the frontend dev server (assumes you wire the provider into your app and add the page):

   npm run dev

Notes
- The server uses a data/ directory under the repository to persist clients and per-project memory files.
- The registration endpoint (/api/register) requires the admin token unless COJANET_SYNC_TOKEN is unset.
- SSE subscribe accepts a token in the query string for browser EventSource compatibility.

Security
- Keep COJANET_SYNC_TOKEN secret. Do not embed in public builds.

