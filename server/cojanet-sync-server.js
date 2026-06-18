const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const url = require("url");

const CONFIG_PATH =
  process.env.COJANET_SYNC_CONFIG ||
  path.join(__dirname, "cojanet-sync-config.json");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

const fileConfig = readJson(CONFIG_PATH, {});
const HOST = process.env.COJANET_SYNC_HOST || fileConfig.host || "0.0.0.0";
const PORT = Number(process.env.COJANET_SYNC_PORT || fileConfig.port || 8787);
const ADMIN_TOKEN =
  process.env.COJANET_SYNC_TOKEN || fileConfig.adminToken || "";
const ALLOWED_ORIGIN =
  process.env.COJANET_ALLOWED_ORIGIN || fileConfig.allowedOrigin || "*";
const DATA_DIR = path.resolve(
  process.env.COJANET_MEMORY_DIR ||
    fileConfig.dataDir ||
    path.join(__dirname, "data")
);
const CLIENTS_FILE = path.join(DATA_DIR, "clients.json");

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  return value;
}

function generateId() {
  return crypto.randomBytes(16).toString("hex");
}

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
    req.on("data", (chunk) => {
      if (body.length + chunk.length > 5 * 1024 * 1024) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function uniqueArray(items) {
  const map = new Map();
  (items || []).forEach((item) => {
    const key =
      item && typeof item === "object" && item.id
        ? item.id
        : JSON.stringify(item);
    map.set(key, item);
  });
  return Array.from(map.values());
}

function mergeMemoryObjects(base, incoming) {
  const left = base && typeof base === "object" ? base : {};
  const right = incoming && typeof incoming === "object" ? incoming : {};
  const merged = {
    ...left,
    ...right,
    updatedAt: nowIso()
  };

  [
    "projects",
    "artifacts",
    "jobs",
    "learnedPatterns",
    "sessionNotes"
  ].forEach((key) => {
    merged[key] = uniqueArray([...(left[key] || []), ...(right[key] || [])]);
  });

  merged.sync = {
    ...(left.sync || {}),
    ...(right.sync || {})
  };

  return merged;
}

function projectFile(projectId) {
  return path.join(DATA_DIR, `memory.${encodeURIComponent(projectId)}.json`);
}

function createProjectSeed(projectId) {
  return {
    projectId,
    schemaVersion: "1.1.0",
    memoryVersion: "remote",
    projects: [],
    artifacts: [],
    jobs: [],
    learnedPatterns: [],
    sessionNotes: [],
    sync: {},
    updatedAt: nowIso()
  };
}

function loadProjectMemory(projectId) {
  const filePath = projectFile(projectId);
  if (!fs.existsSync(filePath)) {
    return writeJson(filePath, createProjectSeed(projectId));
  }

  return readJson(filePath, createProjectSeed(projectId));
}

function saveProjectMemory(projectId, memory) {
  return writeJson(projectFile(projectId), {
    ...createProjectSeed(projectId),
    ...(memory || {}),
    projectId,
    updatedAt: nowIso()
  });
}

function loadClients() {
  return readJson(CLIENTS_FILE, { clients: {} });
}

function saveClient(client) {
  const clients = loadClients();
  clients.clients[client.clientToken] = client;
  writeJson(CLIENTS_FILE, clients);
  return client;
}

function getTokenValue(req, parsed) {
  const headerToken = (req.headers.authorization || "")
    .trim()
    .replace(/^Bearer\s+/i, "");
  return headerToken || parsed.query.clientToken || "";
}

function getClientByToken(token) {
  if (!token) {
    return null;
  }

  return loadClients().clients[token] || null;
}

function isAdminToken(token) {
  return Boolean(ADMIN_TOKEN) && token === ADMIN_TOKEN;
}

function isAuthorizedForProject(projectId, token) {
  if (!ADMIN_TOKEN) {
    return true;
  }

  if (isAdminToken(token)) {
    return true;
  }

  const client = getClientByToken(token);
  return Boolean(client && client.projectId === projectId);
}

function requireAdmin(req, parsed) {
  if (!ADMIN_TOKEN) {
    return true;
  }

  return isAdminToken(getTokenValue(req, parsed));
}

ensureDir(DATA_DIR);
if (!fs.existsSync(CLIENTS_FILE)) {
  writeJson(CLIENTS_FILE, { clients: {} });
}

const subscriptions = new Map();

function addSubscription(projectId, subscription) {
  if (!subscriptions.has(projectId)) {
    subscriptions.set(projectId, []);
  }

  subscriptions.get(projectId).push(subscription);
}

function removeSubscription(projectId, subscriptionId) {
  const entries = subscriptions.get(projectId);
  if (!entries) {
    return;
  }

  subscriptions.set(
    projectId,
    entries.filter((entry) => entry.id !== subscriptionId)
  );
}

function broadcastProjectUpdate(projectId, memory) {
  const entries = subscriptions.get(projectId) || [];
  const payload = JSON.stringify(memory);

  entries.forEach((entry) => {
    try {
      entry.res.write(`event: memory\nid: ${Date.now()}\ndata: ${payload}\n\n`);
    } catch (error) {
      removeSubscription(projectId, entry.id);
    }
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || "", true);

  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && parsed.pathname === "/health") {
    return sendJson(res, 200, {
      ok: true,
      time: nowIso(),
      dataDir: DATA_DIR,
      auth: ADMIN_TOKEN ? "enabled" : "disabled"
    });
  }

  if (req.method === "POST" && parsed.pathname === "/api/register") {
    if (!requireAdmin(req, parsed)) {
      return sendJson(res, 401, { error: "admin required" });
    }

    try {
      const body = await collectJsonBody(req);
      const projectId = body.projectId;

      if (!projectId) {
        return sendJson(res, 400, { error: "projectId required" });
      }

      const client = saveClient({
        clientId: generateId(),
        clientToken: generateId(),
        clientName: body.clientName || `client-${Date.now()}`,
        projectId,
        createdAt: nowIso()
      });

      return sendJson(res, 200, client);
    } catch (error) {
      return sendJson(res, 400, { error: error.message || "invalid body" });
    }
  }

  if (req.method === "GET" && parsed.pathname === "/api/subscribe") {
    const projectId = parsed.query.projectId;
    const token = getTokenValue(req, parsed);

    if (!projectId) {
      return sendJson(res, 400, { error: "projectId required" });
    }

    if (!isAuthorizedForProject(projectId, token)) {
      return sendJson(res, 401, { error: "unauthorized" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });
    res.write("\n");

    const subscription = {
      id: generateId(),
      res
    };

    addSubscription(projectId, subscription);
    res.write(
      `event: memory\nid: ${Date.now()}\ndata: ${JSON.stringify(
        loadProjectMemory(projectId)
      )}\n\n`
    );

    const keepAlive = setInterval(() => {
      try {
        res.write(`: keepalive ${Date.now()}\n\n`);
      } catch (error) {
        clearInterval(keepAlive);
      }
    }, 30000);

    req.on("close", () => {
      clearInterval(keepAlive);
      removeSubscription(projectId, subscription.id);
    });
    return;
  }

  if (req.method === "GET" && parsed.pathname === "/api/memory") {
    const projectId = parsed.query.projectId;
    const token = getTokenValue(req, parsed);

    if (!projectId) {
      return sendJson(res, 400, { error: "projectId required" });
    }

    if (!isAuthorizedForProject(projectId, token)) {
      return sendJson(res, 401, { error: "unauthorized" });
    }

    return sendJson(res, 200, loadProjectMemory(projectId));
  }

  if (req.method === "POST" && parsed.pathname === "/api/memory") {
    try {
      const body = await collectJsonBody(req);
      const projectId = body.projectId;
      const token = getTokenValue(req, parsed);

      if (!projectId) {
        return sendJson(res, 400, { error: "projectId required in body" });
      }

      if (!isAuthorizedForProject(projectId, token)) {
        return sendJson(res, 401, { error: "unauthorized" });
      }

      const mode = body.mode === "replace" ? "replace" : "merge";
      const current = loadProjectMemory(projectId);
      const next =
        mode === "replace"
          ? saveProjectMemory(projectId, body.memory || createProjectSeed(projectId))
          : saveProjectMemory(
              projectId,
              mergeMemoryObjects(current, body.memory || {})
            );

      broadcastProjectUpdate(projectId, next);
      return sendJson(res, 200, next);
    } catch (error) {
      return sendJson(res, 400, { error: error.message || "invalid body" });
    }
  }

  return sendJson(res, 404, { error: "not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Co-Janet sync server listening on http://${HOST}:${PORT}`);
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`Admin token: ${ADMIN_TOKEN ? "enabled" : "disabled"}`);
});
