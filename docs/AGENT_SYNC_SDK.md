# Node.js SDK & CLI for Co-Janet Sync (Agent-to-Agent Memory Sync)

This directory contains tools for Copilot agents (backend code) to sync memory directly without a browser.

## Files

- `src/lib/cojanetSyncClient-node.js` — Node.js SDK class for agent code
- `bin/cojanet-sync` — CLI tool for scripts and command line
- `examples/agent-sync-example.js` — Working example of three agents syncing
- `examples/github-action-sync-example.yml` — GitHub Action to auto-sync after tasks

## Quick Start

### 1. Set environment variables

```bash
export COJANET_SERVER_URL="https://your-sync-server.example.com"
export COJANET_PROJECT_ID="career-ops"
export COJANET_CLIENT_TOKEN="abc123..."  # Get this from server registration
```

### 2. Use in your agent code

```javascript
const { CoJanetSyncClient } = require("./src/lib/cojanetSyncClient-node.js");

const client = new CoJanetSyncClient({
  serverUrl: process.env.COJANET_SERVER_URL,
  projectId: process.env.COJANET_PROJECT_ID,
  clientToken: process.env.COJANET_CLIENT_TOKEN,
});

// Pull memory from other agents
const memory = await client.pullMemory();
console.log(memory.learnedPatterns);  // See what other agents learned

// Push your agent's findings
await client.pushMemory({
  learnedPatterns: [
    {
      id: "pattern-1",
      pattern: "Use quantified metrics",
      context: "resume-writing",
      updatedAt: new Date().toISOString()
    }
  ]
}, "merge");
```

### 3. Use the CLI

```bash
# Pull memory and save to file
node bin/cojanet-sync pull > current-memory.json

# Push memory from file
node bin/cojanet-sync push --file current-memory.json

# Register a new client (requires admin token)
node bin/cojanet-sync register --admin your-admin-token --name "agent-session-2"

# Check server health
node bin/cojanet-sync health
```

## API Reference

### CoJanetSyncClient

```javascript
const client = new CoJanetSyncClient({
  serverUrl: "https://sync.example.com",    // Required
  projectId: "career-ops",                   // Required
  clientToken: "abc123...",                  // For auth (instead of adminToken)
  adminToken: "admin-secret",                // For registration only
  timeout: 10000                              // Request timeout in ms
});
```

#### Methods

**`await client.registerClient(clientName)`**
- Register a new client (requires adminToken on server)
- Returns: `{ clientId, clientToken, clientName, projectId, createdAt }`
- Saves clientToken for future requests

**`await client.pullMemory()`**
- Fetch current memory from server
- Returns: Full memory object with projects, jobs, artifacts, etc.

**`await client.pushMemory(memory, mode)`**
- Send memory to server
- `mode`: `"merge"` (default) or `"replace"`
- Returns: Updated memory object from server

**`await client.syncNow(localMemory, mode)`**
- Pull from server, merge locally, push back
- Useful for reconciling conflicts

## Real-World Example: Three Agents

Run the example to see three agents (Resume Analyzer, Resume Updater, Job Tracker) syncing:

```bash
# Make sure server is running
export COJANET_SERVER_URL="http://localhost:8787"
export COJANET_PROJECT_ID="career-ops"
export COJANET_CLIENT_TOKEN="your-client-token"

node examples/agent-sync-example.js
```

Output:
```
=== Agent A: Resume Analyzer ===
Pulling memory from server...
Loaded 0 learned patterns
Discovered 2 new patterns
Pushing patterns to server...
✓ Patterns saved to server

=== Agent B: Resume Updater ===
Pulling memory from server...
Retrieved 2 learned patterns:
  - Use quantified metrics in accomplishments
  - Lead with impact, not tasks
Updating resume based on learned patterns...
✓ Resume saved to server

=== Agent C: Job Tracker ===
Pulling memory from server...
✓ Job saved to server

=== Final State ===
Learned patterns: 2
Artifacts: 1
Jobs: 1
✓ All agents synced successfully
```

## GitHub Actions Integration

Add auto-sync after your Copilot tasks:

1. Copy `examples/github-action-sync-example.yml` to `.github/workflows/sync-memory.yml`
2. Add secrets to your repo:
   - `COJANET_SERVER_URL` — Your sync server URL
   - `COJANET_PROJECT_ID` — Project ID
   - `COJANET_CLIENT_TOKEN` — Client token for this workflow
3. Whenever a task completes, memory auto-syncs

## Environment Variables

```bash
COJANET_SERVER_URL        # Sync server URL
COJANET_PROJECT_ID        # Project ID
COJANET_CLIENT_TOKEN      # Client token (for pulling/pushing)
COJANET_SYNC_TOKEN        # Admin token (for registration only)
```

## Security

- **Never commit admin token** — Keep COJANET_SYNC_TOKEN in GitHub Actions secrets, not code.
- **Client tokens are semi-public** — Treat as env vars; can be rotated if leaked.
- **Use HTTPS in production** — Sync server must use HTTPS.
- **Merge strategy** — Server prefers newest `updatedAt`; no data loss.

## Next Steps

1. **Test locally:** Run `node examples/agent-sync-example.js` with a local server.
2. **Integrate into your agents:** Import `CoJanetSyncClient` and call in your agent code.
3. **Deploy to production:** Host sync server on Render/Railway, set GitHub Actions secrets, enable CI/CD sync.
4. **Monitor:** Check sync logs in GitHub Actions or server logs.

## Troubleshooting

**"Connection refused"**
- Sync server not running or wrong URL.
- Check `COJANET_SERVER_URL` and server process.

**"Unauthorized"**
- Client token invalid or expired.
- Re-register: `node bin/cojanet-sync register --admin <token> --name "my-agent"`

**"Request timeout"**
- Server is slow or unreachable.
- Increase timeout: `new CoJanetSyncClient({ ..., timeout: 30000 })`

**"File not found"**
- When using CLI `push`, ensure file exists.
- Use absolute path: `node bin/cojanet-sync push --file /path/to/memory.json`
