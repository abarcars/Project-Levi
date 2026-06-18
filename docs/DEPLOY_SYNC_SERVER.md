# Co-Janet Sync Server Deployment Guide

## Overview

The sync server is a small Node.js HTTP server that:
- Persists project memory to disk (data/ folder)
- Handles client registration and authentication
- Broadcasts updates to subscribed clients via Server-Sent Events (SSE)
- Merges concurrent changes from multiple agents

This guide shows how to deploy to popular platforms.

## Prerequisites

- Docker (if using container-based hosting)
- A platform account (Render, Railway, Fly, etc.)
- An admin token (secret) — create a strong random string

## Deployment Options

### Option 1: Render (Easiest)

Render is the simplest option — push code, they handle deployment.

#### Steps:

1. **Fork or link your repo** to Render (https://render.com)

2. **Create a new Web Service:**
   - Connect your GitHub repo
   - Select branch: `add/cojanet-sync-and-ui`
   - Runtime: `Docker`
   - Build command: (leave default)
   - Start command: (leave default — uses Dockerfile CMD)

3. **Set environment variables** (Web Service → Environment):
   ```
   COJANET_SYNC_TOKEN=your-super-secret-admin-token-here
   COJANET_SYNC_PORT=8787
   COJANET_ALLOWED_ORIGIN=https://project-levi.vercel.app
   COJANET_MEMORY_DIR=/var/data/cojanet
   ```
   **Important:** Use `/var/data/` on Render (Render provides persistent storage there).

4. **Add persistent disk** (Web Service → Disks):
   - Mount path: `/var/data/cojanet`
   - Size: 1 GB (or more if needed)

5. **Deploy** — Render builds the Docker image and deploys.

6. **Get your URL:**
   - Render assigns you `https://your-service.onrender.com`
   - Your sync server is now at `https://your-service.onrender.com:8787`

#### Testing:
```bash
curl https://your-service.onrender.com:8787/health
# Returns: {"ok": true, "time": "...", "dataDir": "/var/data/cojanet"}
```

---

### Option 2: Railway (Simple, Pay-per-use)

Railway is fast and has a generous free tier.

#### Steps:

1. **Link your repo** to Railway (https://railway.app)

2. **Create new project → GitHub Repo**
   - Select your Project-Levi repo
   - Select branch: `add/cojanet-sync-and-ui`

3. **Railway auto-detects Dockerfile** — builds and deploys

4. **Set environment variables** (Project → Variables):
   ```
   COJANET_SYNC_TOKEN=your-super-secret-admin-token-here
   COJANET_SYNC_PORT=8787
   COJANET_ALLOWED_ORIGIN=https://project-levi.vercel.app
   COJANET_MEMORY_DIR=/app/data
   ```

5. **Add volume** (for persistent storage):
   - Volume path: `/app/data`
   - Size: 5 GB (or more)

6. **Deploy** — Railway builds and starts the service

7. **Get public URL:**
   - Railway assigns `https://your-service-railway.up.railway.app`
   - Your sync server is at `https://your-service-railway.up.railway.app:8787`

---

### Option 3: Fly.io (Powerful, Global)

Fly.io runs apps worldwide with built-in networking.

#### Steps:

1. **Install Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Create a Fly app:**
   ```bash
   cd Project-Levi
   fly launch
   ```
   - Choose region (e.g., `sjc` for San Francisco)
   - Choose builder: `Docker`
   - Follow prompts

3. **Edit `fly.toml`** (created by `fly launch`):
   ```toml
   [env]
   COJANET_SYNC_TOKEN = "your-super-secret-admin-token-here"
   COJANET_SYNC_PORT = "8787"
   COJANET_ALLOWED_ORIGIN = "https://project-levi.vercel.app"
   COJANET_MEMORY_DIR = "/data/cojanet"

   [[services]]
   internal_port = 8787
   protocol = "tcp"
   auto_stop_machines = true
   auto_start_machines = true

   [[services.ports]]
   port = 443
   handlers = ["tls"]

   [[services.tcp_checks]]
   interval = 30000
   timeout = 5000
   grace_period = 5000
   
   [[mounts]]
   source = "cojanet_data"
   destination = "/data/cojanet"
   ```

4. **Create volume:**
   ```bash
   fly volumes create cojanet_data --size 10 --region sjc
   ```

5. **Deploy:**
   ```bash
   fly deploy
   ```

6. **Get public URL:**
   ```bash
   fly open
   # Your sync server is at https://<app-name>.fly.dev:8787
   ```

---

### Option 4: DigitalOcean App Platform (Traditional VPS)

DigitalOcean is a traditional VPS provider with a managed app platform.

#### Steps:

1. **Create DigitalOcean account** (https://www.digitalocean.com/products/app-platform)

2. **Create new app:**
   - Connect GitHub repo
   - Select branch: `add/cojanet-sync-and-ui`
   - Runtime: `Docker`

3. **Configure service:**
   - Name: `cojanet-sync`
   - Port: `8787`
   - HTTP Routes: `/health`

4. **Add environment variables:**
   ```
   COJANET_SYNC_TOKEN=your-super-secret-admin-token-here
   COJANET_SYNC_PORT=8787
   COJANET_ALLOWED_ORIGIN=https://project-levi.vercel.app
   COJANET_MEMORY_DIR=/mnt/data
   ```

5. **Add volume:**
   - Mount path: `/mnt/data`
   - Size: 1-5 GB

6. **Deploy** — DigitalOcean builds and runs

7. **Get URL:**
   - DigitalOcean assigns `https://your-app.ondigitalocean.app`
   - Sync server at `https://your-app.ondigitalocean.app:8787`

---

## Quick Summary Table

| Platform | Ease | Free Tier | Persistence | URL Format |
|----------|------|-----------|-------------|------------|
| Render | ⭐⭐⭐⭐⭐ | 750 hrs/mo | Yes | `https://service.onrender.com:8787` |
| Railway | ⭐⭐⭐⭐⭐ | $5/mo | Yes | `https://service.railway.app:8787` |
| Fly.io | ⭐⭐⭐⭐ | $3/mo | Yes | `https://app.fly.dev:8787` |
| DigitalOcean | ⭐⭐⭐ | $5/mo | Yes | `https://app.ondigitalocean.app:8787` |

---

## After Deployment: Set Up Vercel

Once your sync server is live, update your Vercel project:

1. **Go to Vercel project settings**

2. **Add environment variables:**
   ```
   VITE_COJANET_SERVER_URL=https://your-deployed-server-url:8787
   VITE_COJANET_PROJECT_ID=career-ops
   ```

3. **Redeploy** — Vercel will pick up the env vars and rebuild

4. **Test** — Open https://project-levi.vercel.app
   - No more localhost connection errors
   - App can now register, pull, push, and sync

---

## Create Admin & Client Tokens

Once deployed, create tokens for your agents:

```bash
# Create an admin token for registration (save this securely)
ADMIN_TOKEN="your-super-secret-admin-token-here"
SERVER_URL="https://your-deployed-server:8787"

# Register Agent 1
curl -X POST "${SERVER_URL}/api/register" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"career-ops","clientName":"agent-1"}'

# Save the returned clientToken as COJANET_CLIENT_TOKEN for Agent 1

# Register Agent 2
curl -X POST "${SERVER_URL}/api/register" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"career-ops","clientName":"agent-2"}'

# Save the returned clientToken as COJANET_CLIENT_TOKEN for Agent 2
```

---

## Configure GitHub Actions

Add auto-sync to your CI/CD:

1. **Copy `examples/github-action-sync-example.yml` to `.github/workflows/sync-memory.yml`**

2. **Add GitHub secrets** (Repo → Settings → Secrets):
   ```
   COJANET_SERVER_URL=https://your-deployed-server:8787
   COJANET_PROJECT_ID=career-ops
   COJANET_CLIENT_TOKEN=<token-from-step-above>
   ```

3. **Commit** — Next time a Copilot task runs, memory auto-syncs

---

## Monitoring & Logs

### Render
```bash
# View logs in Render dashboard
# Logs → Service → cojanet-sync
```

### Railway
```bash
# View logs in Railway dashboard
# Logs tab
```

### Fly.io
```bash
fly logs
```

### DigitalOcean
```bash
# View in App Platform dashboard
# Logs tab
```

---

## Troubleshooting

**"Connection refused"**
- Server not running or wrong port
- Check logs for startup errors

**"Unauthorized" (401)**
- Admin token is wrong
- Double-check COJANET_SYNC_TOKEN env var

**"Permission denied" (writing to /data)**
- Volume not mounted or permissions issue
- Check volume configuration in platform UI

**"Out of memory"**
- Too many artifacts/jobs stored
- Archive old memory or increase volume size

---

## My Recommendation

**Start with Render:**
1. It's the easiest (just push Docker)
2. Free tier covers small deployments
3. HTTPS is automatic
4. Persistent disk is included

If you outgrow Render, migrate to Railway or Fly.io (they have similar APIs).

---

## Next Steps

1. **Pick a platform** (I recommend Render)
2. **Deploy** using the steps above
3. **Get your server URL** (e.g., `https://cojanet.onrender.com:8787`)
4. **Create admin & client tokens** using curl
5. **Update Vercel env vars** with the server URL
6. **Redeploy Vercel** to pick up the new URL
7. **Test** — open https://project-levi.vercel.app and register/sync
8. **Add GitHub Actions** for auto-sync

Which platform would you like me to help you set up in detail?
