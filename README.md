# Co-Janet sync additions

This branch adds a lightweight Co-Janet sync stack:

- `.gitignore` - ignores local sync data, local config, and Node build artifacts
- `package.json` - adds a local server script and a lightweight source parse check
- `server/cojanet-sync-server.js` - file-backed sync server with project registration, per-client tokens, and SSE updates
- `server/cojanet-sync-config.example.json` - example local server configuration
- `src/lib/cojanetSyncClient.js` - browser/client helpers for register, pull, push, and subscribe
- `src/context/CoJanetMemoryProvider.jsx` - React provider that stores a client token, sync state, and memory helpers
- `src/pages/CoJanetSyncPage.jsx` - basic sync page with register, pull, push, and sync controls

## Local run instructions

### 1. Start the sync server

1. Copy `server/cojanet-sync-config.example.json` to `server/cojanet-sync-config.json`.
2. Replace `adminToken` with a local secret token.
3. Start the server:

```bash
npm run cojanet:server
```

The server listens on `http://127.0.0.1:8787` by default and writes memory files to `server/data/`.

### 2. Use the frontend helpers

Render `CoJanetMemoryProvider` around the part of your React app that needs shared memory, then render `CoJanetSyncPage` inside it:

```jsx
import React from "react";
import { CoJanetMemoryProvider } from "./src/context/CoJanetMemoryProvider";
import { CoJanetSyncPage } from "./src/pages/CoJanetSyncPage";

export function App() {
  return (
    <CoJanetMemoryProvider
      serverUrl="http://127.0.0.1:8787"
      projectId="demo-project"
      clientName="local-dev-client"
      adminToken={window.localStorage.getItem("cojanet-admin-token")}
      initialMemory={{}}
    >
      <CoJanetSyncPage />
    </CoJanetMemoryProvider>
  );
}
```

Pass `serverUrl`, `projectId`, `clientName`, and a developer-only `adminToken` when registering a new client. After registration, the provider stores the issued `clientToken` locally and reuses it for pull, push, and SSE subscribe calls. The admin token is only needed to mint the first client token.

## Registration, auth, and SSE flow

1. A trusted admin calls `POST /api/register` with the admin token to create a project-scoped client token.
2. The React provider stores the returned `clientId` and `clientToken` in local storage for that project.
3. The client token is then used for:
   - `GET /api/memory?projectId=...`
   - `POST /api/memory`
   - `GET /api/subscribe?projectId=...&clientToken=...`
4. The browser uses the project-scoped client token for SSE because native `EventSource` cannot attach custom auth headers.
5. The server immediately sends the current project memory over SSE and broadcasts later writes to all connected clients for that project.

Open two clients against the same `projectId` to verify that a push from one client appears in the other through SSE.

## Security notes

- Treat the admin token like a secret. Do not embed it in public builds.
- Register clients from a trusted server path or local-only developer workflow.
- Client tokens are scoped to a single `projectId`; the server rejects access to other projects.
- `server/data/` is ignored so local memory snapshots and issued client tokens are not committed.

## Review and testing steps

1. Copy the example config, set a local admin token, and run `npm run cojanet:server`.
2. Open one client, register it, and confirm that pull/push requests succeed.
3. Open a second client on the same `projectId`.
4. Push updated memory from one client and confirm the other client receives the SSE update.