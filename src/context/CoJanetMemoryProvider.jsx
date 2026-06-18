import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { pullRemote, pushRemote, registerClient, subscribe } from "../lib/cojanetSyncClient";

const STORAGE_KEY = "cojanet.client";
const CoJanetContext = createContext();

export function CoJanetMemoryProvider({ children, projectId, syncConfig = {}, autoSync = false, syncOnStartup = false }) {
  const { serverUrl = "http://localhost:8787", adminToken, token } = syncConfig;
  const [client, setClient] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  });
  const [memory, setMemory] = useState(null);
  const [syncState, setSyncState] = useState({ status: "idle", lastSyncAt: null, peers: [] });
  const subRef = useRef(null);

  useEffect(() => {
    if (!client?.clientToken) return;
    setSyncState(s => ({ ...s, status: "subscribing" }));
    const s = subscribe(serverUrl, projectId, client.clientToken, (mem) => {
      setMemory(mem);
      setSyncState(s => ({ ...s, status: "synced", lastSyncAt: new Date().toISOString() }));
    });
    subRef.current = s;
    return () => s && s.close();
  }, [client?.clientToken, projectId, serverUrl]);

  useEffect(() => {
    if (syncOnStartup && client?.clientToken) {
      syncNow();
    }
  }, [client?.clientToken]);

  async function ensureRegistered(clientName = "cojanet-client") {
    if (client?.clientToken) return client;
    try {
      if (!adminToken && !token) {
        throw new Error("No admin token or client token available for registration");
      }
      const res = await registerClient(serverUrl, adminToken, projectId, clientName);
      const c = { ...res };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
      setClient(c);
      return c;
    } catch (err) {
      console.warn("register error", err);
      throw err;
    }
  }

  async function pullRemoteNow() {
    setSyncState(s => ({ ...s, status: "pulling" }));
    const ct = client?.clientToken || token;
    const mem = await pullRemote(serverUrl, projectId, ct);
    setMemory(mem);
    setSyncState(s => ({ ...s, status: "pulled", lastSyncAt: new Date().toISOString() }));
    return mem;
  }

  async function pushRemoteNow(mode = "merge") {
    setSyncState(s => ({ ...s, status: "pushing" }));
    const ct = client?.clientToken || token;
    const mem = await pushRemote(serverUrl, projectId, ct, memory, mode);
    setMemory(mem);
    setSyncState(s => ({ ...s, status: "pushed", lastSyncAt: new Date().toISOString() }));
    return mem;
  }

  async function syncNow() {
    try {
      setSyncState(s => ({ ...s, status: "syncing" }));
      const remote = await pullRemoteNow();
      setMemory(remote);
      await pushRemoteNow("replace");
      setSyncState(s => ({ ...s, status: "synced", lastSyncAt: new Date().toISOString() }));
    } catch (err) {
      setSyncState(s => ({ ...s, status: "error", error: err.message }));
      throw err;
    }
  }

  const value = {
    memory,
    client,
    syncState,
    ensureRegistered,
    pullRemote: pullRemoteNow,
    pushRemote: pushRemoteNow,
    syncNow,
  };

  return <CoJanetContext.Provider value={value}>{children}</CoJanetContext.Provider>;
}

export function useCoJanetMemory() {
  return useContext(CoJanetContext);
}
