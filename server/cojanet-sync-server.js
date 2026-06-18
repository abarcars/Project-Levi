// server/cojanet-sync-server.js
// Simple Co-Janet sync server with per-project memory, client registration, and SSE push.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const url = require("url");

const HOST = process.env.COJANET_SYNC_HOST || "0.0.0.0";
const PORT = Number(process.env.COJANET_SYNC_PORT || 8787);
const ADMIN_TOKEN = process.env.COJANET_SYNC_TOKEN || ""; // admin token used to create client tokens
const ALLOWED_ORIGIN = process.env.COJANET_ALLOWED_ORIGIN || "*";
const DATA_DIR = process.env.COJANET_MEMORY_DIR || path.join(__dirname, "data");

// utilities
function nowIso() { return new Date().toISOString(); }
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function readJson(p, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return fallback; }
}
function writeJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2)); return obj; }
function generateId() { return crypto.randomBytes(16).toString("hex"); }
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(JSON.stringify(payload, null, 2));
}
function collectJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; if (body.length > 5 * 1024 * 1024) reject(new Error("Body too large")); });
    req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

// persistence layout
ensureDir(DATA_DIR);
const clientsFile = path.join(DATA_DIR, "clients.json");
if (!fs.existsSync(clientsFile)) writeJson(clientsFile, { clients: {} });

// in-memory SSE subscriptions: { projectId: [{ id, res, lastEventId, clientId }] }
const subscriptions = new Map();

// helpers for project memory
function projectFile(projectId) {
  return path.join(DATA_DIR, `memory.${encodeURIComponent(projectId)}.json`);
}

function loadProjectMemory(projectId) {
  const file = projectFile(projectId);
  if (!fs.existsSync(file)) {
    const seed = { projectId, schemaVersion: "1.1.0", memoryVersion: "remote", projects: [], artifacts: [], jobs: [], learnedPatterns: [], sessionNotes: [], sync: {}, updatedAt: nowIso() };
    writeJson(file, seed);
    return seed;
  }
  return readJson(file, {});
}
function saveProjectMemory(projectId, memory) {
  const file = projectFile(projectId);
  ensureDir(path.dirname(file));
  return writeJson(file, memory);
}

// clients store: map clientToken -> { clientId, clientName, projectId, createdAt }
function saveClient(clientObj) {
  const clients = readJson(clientsFile, { clients: {} });
  clients.clients[clientObj.clientToken] = clientObj;
  writeJson(clientsFile, clients);
}
function getClientByToken(token) {
  const clients = readJson(clientsFile, { clients: {} });
  return clients.clients[token] || null;
}
function requireAdmin(req) {
  if (!ADMIN_TOKEN) return true; // admin auth disabled
  const auth = (req.headers.authorization || "").trim();
  return auth === `Bearer ${ADMIN_TOKEN}`;
}

// simple merge logic: reuse a safe merge approach — dedupe by id or JSON and prefer newer updatedAt when scalar
function deepClone(v) { return JSON.parse(JSON.stringify(v)); }
function normalizeArray(value) { return Array.isArray(value) ? value : []; }
function uniqueScalarArray(value) { return Array.from(new Set(normalizeArray(value).filter(Boolean))); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function sortByUpdatedAtDesc(items) {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a?.updatedAt || a?.createdAt || 0) || 0;
    const bTime = Date.parse(b?.updatedAt || b?.createdAt || 0) || 0;
    return bTime - aTime;
  });
}

function mergeScalarPreferringNewest(baseValue, incomingValue, baseUpdatedAt, incomingUpdatedAt) {
  if (incomingValue === undefined) return baseValue;
  if (baseValue === undefined) return incomingValue;

  const baseTs = Date.parse(baseUpdatedAt || 0) || 0;
  const incomingTs = Date.parse(incomingUpdatedAt || 0) || 0;
  return incomingTs >= baseTs ? incomingValue : baseValue;
}

function mergeEntity(base, incoming) {
  const merged = { ...(base || {}) };
  const baseUpdatedAt = base?.updatedAt || base?.createdAt || 0;
  const incomingUpdatedAt = incoming?.updatedAt || incoming?.createdAt || 0;

  for (const key of Object.keys(incoming || {})) {
    const baseValue = merged[key];
    const incomingValue = incoming[key];

    if (Array.isArray(incomingValue) && Array.isArray(baseValue)) {
      if (incomingValue.every((item) => typeof item !== "object" || item === null)) {
        merged[key] = uniqueScalarArray([...baseValue, ...incomingValue]);
      } else {
        merged[key] = dedupeEntities([...baseValue, ...incomingValue]);
      }
      continue;
    }

    if (isObject(incomingValue) && isObject(baseValue)) {
      merged[key] = mergeEntity(baseValue, incomingValue);
      continue;
    }

    merged[key] = mergeScalarPreferringNewest(baseValue, incomingValue, baseUpdatedAt, incomingUpdatedAt);
  }

  if (!merged.updatedAt) {
    merged.updatedAt = incomingUpdatedAt || baseUpdatedAt || nowIso();
  }

  return merged;
}

function dedupeEntities(items) {
  const merged = new Map();

  for (const item of normalizeArray(items)) {
    if (!item || typeof item !== "object") continue;
    const key = item.id || crypto.createHash("sha1").update(JSON.stringify(item)).digest("hex");

    if (!merged.has(key)) {
      merged.set(key, deepClone(item));
      continue;
    }

    merged.set(key, mergeEntity(merged.get(key), item));
  }

  return sortByUpdatedAtDesc(Array.from(merged.values()));
}

function normalizeMemory(memory) {
  const normalized = {
    schemaVersion: memory?.schemaVersion || "1.1.0",
    memoryVersion: memory?.memoryVersion || "remote",
    identity: isObject(memory?.identity) ? memory.identity : {},
    userProfile: isObject(memory?.userProfile) ? memory.userProfile : {},
    projects: normalizeArray(memory?.projects),
    artifacts: normalizeArray(memory?.artifacts),
    jobs: normalizeArray(memory?.jobs),
    learnedPatterns: normalizeArray(memory?.learnedPatterns),
    sessionNotes: normalizeArray(memory?.sessionNotes),
    sync: isObject(memory?.sync) ? memory.sync : {},
    updatedAt: memory?.updatedAt || nowIso()
  };

  normalized.userProfile = {
    ...(normalized.userProfile || {}),
    preferences: uniqueScalarArray(normalized.userProfile?.preferences || []),
    guardrails: uniqueScalarArray(normalized.userProfile?.guardrails || [])
  };

  normalized.projects = dedupeEntities(normalized.projects);
  normalized.artifacts = dedupeEntities(normalized.artifacts).slice(0, 1000);
  normalized.jobs = dedupeEntities(normalized.jobs).slice(0, 1000);
  normalized.learnedPatterns = dedupeEntities(normalized.learnedPatterns).slice(0, 1000);
  normalized.sessionNotes = dedupeEntities(normalized.sessionNotes).slice(0, 250);

  normalized.sync = {
    lastPulledAt: normalized.sync?.lastPulledAt || null,
    lastPushedAt: normalized.sync?.lastPushedAt || null,
    lastServerUrl: normalized.sync?.lastServerUrl || "",
    lastSyncStatus: normalized.sync?.lastSyncStatus || "server"
  };

  return normalized;
}

function mergeMemoryObjects(baseMemory, incomingMemory) {
  const base = normalizeMemory(baseMemory || {});
  const incoming = normalizeMemory(incomingMemory || {});

  return normalizeMemory({
    schemaVersion: incoming.schemaVersion || base.schemaVersion,
    memoryVersion: incoming.memoryVersion || base.memoryVersion,
    identity: mergeEntity(base.identity, incoming.identity),
    userProfile: mergeEntity(base.userProfile, incoming.userProfile),
    projects: dedupeEntities([...base.projects, ...incoming.projects]),
    artifacts: dedupeEntities([...base.artifacts, ...incoming.artifacts]).slice(0, 1000),
    jobs: dedupeEntities([...base.jobs, ...incoming.jobs]).slice(0, 1000),
    learnedPatterns: dedupeEntities([...base.learnedPatterns, ...incoming.learnedPatterns]).slice(0, 1000),
    sessionNotes: dedupeEntities([...base.sessionNotes, ...incoming.sessionNotes]).slice(0, 250),
    sync: mergeEntity(base.sync, incoming.sync),
    updatedAt: new Date(
      Math.max(
        Date.parse(base.updatedAt || 0) || 0,
        Date.parse(incoming.updatedAt || 0) || 0,
        Date.now()
      )
    ).toISOString()
  });
}

function addSubscription(projectId, sub) {
  if (!subscriptions.has(projectId)) subscriptions.set(projectId, []);
  subscriptions.get(projectId).push(sub);
}
function removeSubscription(projectId, id) {
  if (!subscriptions.has(projectId)) return;
  subscriptions.set(projectId, subscriptions.get(projectId).filter(s => s.id !== id));
}
function broadcastProjectUpdate(projectId, memory) {
  const subs = subscriptions.get(projectId) || [];
  const payload = JSON.stringify(memory);
  for (const s of subs) {
    try {
      s.res.write(`event: memory\nid: ${Date.now()}\ndata: ${payload}\n\n`);
    } catch (e) {
      removeSubscription(projectId, s.id);
    }
  }
}

// HTTP server
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  // health
  const parsed = url.parse(req.url || "", true);
  if (req.method === "GET" && parsed.pathname === "/health") {
    return sendJson(res, 200, { ok: true, time: nowIso(), dataDir: DATA_DIR });
  }

  // register client (admin only)
  if (req.method === "POST" && parsed.pathname === "/api/register") {
    if (!requireAdmin(req)) return sendJson(res, 401, { error: "admin required" });
    try {
      const body = await collectJsonBody(req);
      const projectId = body?.projectId;
      if (!projectId) return sendJson(res, 400, { error: "projectId required" });
      const clientId = generateId();
      const clientToken = generateId();
      const clientName = body?.clientName || `client-${clientId.slice(0,6)}`;
      const clientObj = { clientId, clientToken, clientName, projectId, createdAt: nowIso() };
      saveClient(clientObj);
      return sendJson(res, 200, clientObj);
    } catch (err) {
      return sendJson(res, 400, { error: err.message || "invalid" });
    }
  }

  // SSE subscribe: GET /api/subscribe?projectId=... (Authorization: Bearer <clientToken>)
  if (req.method === "GET" && parsed.pathname === "/api/subscribe") {
    const projectId = parsed.query.projectId;
    if (!projectId) return sendJson(res, 400, { error: "projectId required" });
    // allow token in query for EventSource clients
    const tokenFromQuery = parsed.query.token || null;
    const authHeader = (req.headers.authorization || "").trim().replace(/^Bearer\s+/i, "");
    const auth = authHeader || tokenFromQuery || "";
    const client = getClientByToken(auth);
    if (ADMIN_TOKEN && !client) return sendJson(res, 401, { error: "unauthorized" });

    // Setup SSE
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });
    res.write("\n");

    const sub = { id: generateId(), res, clientId: client?.clientId || null, lastEventId: parsed.query.lastEventId || null };
    addSubscription(projectId, sub);

    // Immediately send current memory as first event
    const mem = loadProjectMemory(projectId);
    res.write(`event: memory\nid: ${Date.now()}\ndata: ${JSON.stringify(mem)}\n\n`);

    // cleanup on close
    req.on("close", () => removeSubscription(projectId, sub.id));
    return;
  }

  // GET memory: /api/memory?projectId=...
  if (req.method === "GET" && parsed.pathname === "/api/memory") {
    const projectId = parsed.query.projectId;
    if (!projectId) return sendJson(res, 400, { error: "projectId required" });
    const authHeader = (req.headers.authorization || "").trim().replace(/^Bearer\s+/i, "");
    if (ADMIN_TOKEN && authHeader !== ADMIN_TOKEN && !getClientByToken(authHeader)) return sendJson(res, 401, { error: "unauthorized" });
    return sendJson(res, 200, loadProjectMemory(projectId));
  }

  // POST memory: /api/memory  { projectId, mode, memory }
  if (req.method === "POST" && parsed.pathname === "/api/memory") {
    try {
      const body = await collectJsonBody(req);
      const projectId = body?.projectId;
      if (!projectId) return sendJson(res, 400, { error: "projectId required in body" });
      const mode = body?.mode || "merge";
      const incoming = body?.memory || {};

      const authHeader = (req.headers.authorization || "").trim().replace(/^Bearer\s+/i, "");
      if (ADMIN_TOKEN && authHeader !== ADMIN_TOKEN && !getClientByToken(authHeader)) return sendJson(res, 401, { error: "unauthorized" });

      const current = loadProjectMemory(projectId);
      const next = mode === "replace" ? incoming : mergeMemoryObjects(current, incoming);
      saveProjectMemory(projectId, next);

      // broadcast to SSE subscribers
      broadcastProjectUpdate(projectId, next);

      return sendJson(res, 200, next);
    } catch (err) {
      return sendJson(res, 400, { error: err.message || "invalid" });
    }
  }

  // not found
  return sendJson(res, 404, { error: "not found" });
});

server.listen(PORT, HOST, () => {
  ensureDir(DATA_DIR);
  console.log(`Co-Janet sync server listening on http://${HOST}:${PORT}`);
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`Admin token: ${ADMIN_TOKEN ? "enabled" : "disabled"}`);
});
