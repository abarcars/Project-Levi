// src/lib/cojanetSyncClient.js
// Client helpers for Co-Janet sync server (browser side).

export async function registerClient(serverUrl, adminToken, projectId, clientName) {
  const res = await fetch(`${serverUrl.replace(/\/$/, "")}/api/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {})
    },
    body: JSON.stringify({ projectId, clientName })
  });
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  return await res.json(); // { clientId, clientToken, clientName, projectId, createdAt }
}

export async function pullRemote(serverUrl, projectId, clientToken) {
  const res = await fetch(`${serverUrl.replace(/\/$/, "")}/api/memory?projectId=${encodeURIComponent(projectId)}`, {
    headers: {
      "Content-Type": "application/json",
      ...(clientToken ? { Authorization: `Bearer ${clientToken}` } : {})
    }
  });
  if (!res.ok) throw new Error(`pull failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

export async function pushRemote(serverUrl, projectId, clientToken, memory, mode = "merge") {
  const res = await fetch(`${serverUrl.replace(/\/$/, "")}/api/memory`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(clientToken ? { Authorization: `Bearer ${clientToken}` } : {})
    },
    body: JSON.stringify({ projectId, mode, memory })
  });
  if (!res.ok) throw new Error(`push failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

export function subscribe(serverUrl, projectId, clientToken, onMemory) {
  const eUrl = `${serverUrl.replace(/\/$/, "")}/api/subscribe?projectId=${encodeURIComponent(projectId)}`;
  // EventSource doesn't support custom headers; pass token as query if necessary (otherwise use pre-shared admin token)
  const urlWithToken = clientToken ? `${eUrl}&token=${encodeURIComponent(clientToken)}` : eUrl;
  const es = new EventSource(urlWithToken);
  es.addEventListener("memory", (ev) => {
    try { const m = JSON.parse(ev.data); onMemory(m); } catch (e) { console.warn("invalid memory event", e); }
  });
  es.onerror = (err) => { console.warn("SSE error", err); /* caller can reconnect */ };
  return {
    close() { es.close(); }
  };
}
