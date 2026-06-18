function normalizeServerUrl(serverUrl) {
  return String(serverUrl || "").replace(/\/+$/, "");
}

function buildUrl(serverUrl, pathname, params) {
  const url = new URL(`${normalizeServerUrl(serverUrl)}${pathname}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url;
}

async function readJsonResponse(response) {
  let payload = {};

  try {
    payload = await response.json();
  } catch (error) {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return payload;
}

function createAuthHeaders(token) {
  return token ? { Authorization: "Bearer " + token } : {};
}

async function registerClient(serverUrl, adminToken, projectId, clientName) {
  const response = await fetch(buildUrl(serverUrl, "/api/register"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...createAuthHeaders(adminToken)
    },
    body: JSON.stringify({
      projectId,
      clientName
    })
  });

  return readJsonResponse(response);
}

async function pullRemote(serverUrl, projectId, clientToken) {
  const response = await fetch(
    buildUrl(serverUrl, "/api/memory", { projectId }).toString(),
    {
      headers: createAuthHeaders(clientToken)
    }
  );

  return readJsonResponse(response);
}

async function pushRemote(serverUrl, projectId, clientToken, memory, mode) {
  const response = await fetch(buildUrl(serverUrl, "/api/memory"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...createAuthHeaders(clientToken)
    },
    body: JSON.stringify({
      projectId,
      mode: mode || "merge",
      memory
    })
  });

  return readJsonResponse(response);
}

function subscribe(serverUrl, projectId, clientToken, onMemoryUpdate) {
  if (typeof EventSource === "undefined") {
    throw new Error("EventSource is not available in this environment");
  }

  const eventSource = new EventSource(
    buildUrl(serverUrl, "/api/subscribe", {
      projectId,
      clientToken
    }).toString()
  );

  eventSource.addEventListener("memory", (event) => {
    if (typeof onMemoryUpdate !== "function") {
      return;
    }

    try {
      onMemoryUpdate(JSON.parse(event.data));
    } catch (error) {
      onMemoryUpdate(null, {
        message: error.message,
        rawData: event.data
      });
    }
  });

  return () => {
    eventSource.close();
  };
}

module.exports = {
  registerClient,
  pullRemote,
  pushRemote,
  subscribe
};
