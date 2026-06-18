import React, { useState } from "react";
import { useCoJanetMemory } from "../context/CoJanetMemoryProvider";

export default function CoJanetSyncPage() {
  const {
    client,
    memory,
    syncState,
    ensureRegistered,
    pullRemote,
    pushRemote,
    syncNow
  } = useCoJanetMemory();

  const [busy, setBusy] = useState(false);
  const [pushMode, setPushMode] = useState("merge");
  const [log, setLog] = useState([]);
  const [copied, setCopied] = useState(false);

  function appendLog(msg) {
    setLog((l) => [ `${new Date().toISOString()} - ${msg}`, ...l ].slice(0, 200));
  }

  async function handleRegister() {
    setBusy(true);
    appendLog("Starting registration...");
    try {
      await ensureRegistered("Azi-client");
      appendLog("Registration complete (local token saved).");
    } catch (err) {
      appendLog(`Registration failed: ${err?.message || err}`);
      appendLog("Hint: provider must be configured with adminToken or a pre-issued client token.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePull() {
    setBusy(true);
    appendLog("Pulling remote memory...");
    try {
      const mem = await pullRemote();
      appendLog(`Pulled memory — ${JSON.stringify({ updatedAt: mem?.updatedAt }).slice(0,120)}`);
    } catch (err) {
      appendLog(`Pull failed: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  async function handlePush() {
    setBusy(true);
    appendLog(`Pushing memory (mode=${pushMode})...`);
    try {
      const mem = await pushRemote(pushMode);
      appendLog(`Push OK — server updatedAt=${mem?.updatedAt}`);
    } catch (err) {
      appendLog(`Push failed: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncNow() {
    setBusy(true);
    appendLog("Full sync: pull -> push (replace) ...");
    try {
      await syncNow();
      appendLog("Sync complete.");
    } catch (err) {
      appendLog(`Sync failed: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  function handleCopyMemory() {
    const text = JSON.stringify(memory || {}, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      appendLog("Memory copied to clipboard.");
      setTimeout(() => setCopied(false), 1500);
    }, (e) => {
      appendLog(`Copy failed: ${e?.message || e}`);
    });
  }

  return (
    <div style={{ fontFamily: "system-ui, Arial, sans-serif", padding: 20, maxWidth: 1000 }}>
      <h2>Co‑Janet Sync — Azi</h2>

      <section style={{ marginBottom: 16 }}>
        <h3>Client</h3>
        <div>
          <strong>clientId:</strong> {client?.clientId || "— not registered —"}
        </div>
        <div>
          <strong>clientToken:</strong>{" "}
          {client?.clientToken ? (
            <>
              <code style={{ wordBreak: "break-all" }}>{client.clientToken}</code>
            </>
          ) : (
            "—"
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          <button onClick={handleRegister} disabled={busy}>
            {client?.clientToken ? "Already registered" : "Register (requires adminToken in provider)"}
          </button>
          <button
            onClick={() => {
              if (!client?.clientToken) {
                appendLog("No client token to copy.");
                return;
              }
              navigator.clipboard?.writeText(client.clientToken);
              appendLog("Client token copied to clipboard.");
            }}
            disabled={!client?.clientToken}
            style={{ marginLeft: 8 }}
          >
            Copy client token
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h3>Sync Controls</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={handlePull} disabled={busy}>Pull remote</button>

          <label>
            Push mode:
            <select value={pushMode} onChange={(e) => setPushMode(e.target.value)} style={{ marginLeft: 6 }}>
              <option value="merge">merge</option>
              <option value="replace">replace</option>
            </select>
          </label>
          <button onClick={handlePush} disabled={busy}>Push remote</button>

          <button onClick={handleSyncNow} disabled={busy}>Sync now (pull+push)</button>
          <div style={{ marginLeft: 12 }}>
            <strong>Status:</strong> {syncState?.status || "idle"}
            {syncState?.lastSyncAt && <> — <small>last: {syncState.lastSyncAt}</small></>}
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h3>Memory Preview</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <button onClick={handleCopyMemory} disabled={!memory}>Copy memory JSON</button>
          <button onClick={() => appendLog(JSON.stringify(memory ? { updatedAt: memory.updatedAt } : "no-memory"))}>Log memory meta</button>
          {copied && <span style={{ marginLeft: 8, color: "green" }}>Copied!</span>}
        </div>
        <textarea
          readOnly
          value={JSON.stringify(memory || {}, null, 2)}
          style={{ width: "100%", height: 320, fontFamily: "monospace", fontSize: 12 }}
        />
      </section>

      <section>
        <h3>Activity Log</h3>
        <div style={{ maxHeight: 240, overflow: "auto", background: "#111", color: "#eee", padding: 8, borderRadius: 6 }}>
          {log.length === 0 ? <div style={{ color: "#888" }}>No activity yet</div> : null}
          <ul style={{ paddingLeft: 16 }}>
            {log.map((line, i) => (
              <li key={i}><small>{line}</small></li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
