// src/lib/cojanetSyncClient-node.js
// Node.js SDK for Copilot agents to sync memory directly (no browser needed).
// Use in backend tasks, GitHub Actions, or any Node.js environment.

const http = require("http");
const https = require("https");
const url = require("url");

class CoJanetSyncClient {
  constructor(config = {}) {
    this.serverUrl = config.serverUrl || "http://localhost:8787";
    this.projectId = config.projectId || "career-ops";
    this.clientToken = config.clientToken || "";
    this.adminToken = config.adminToken || "";
    this.timeout = config.timeout || 10000;
  }

  // Helper: make HTTP request
  async _request(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
      const parsed = url.parse(this.serverUrl);
      const isHttps = parsed.protocol === "https:";
      const client = isHttps ? https : http;
      const port = parsed.port || (isHttps ? 443 : 80);
      const path = endpoint;

      const headers = {
        "Content-Type": "application/json",
      };

      // Use client token if available, else admin token
      const token = this.clientToken || this.adminToken;
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const opts = {
        hostname: parsed.hostname,
        port,
        path,
        method,
        headers,
        timeout: this.timeout,
      };

      const req = client.request(opts, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || data}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.timeout}ms`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  // Register a new client (requires admin token on server)
  async registerClient(clientName = "copilot-agent") {
    const endpoint = `/api/register`;
    const body = { projectId: this.projectId, clientName };
    const result = await this._request("POST", endpoint, body);
    // Save the returned client token for future requests
    this.clientToken = result.clientToken;
    return result; // { clientId, clientToken, clientName, projectId, createdAt }
  }

  // Pull memory from server
  async pullMemory() {
    const endpoint = `/api/memory?projectId=${encodeURIComponent(this.projectId)}`;
    return await this._request("GET", endpoint);
  }

  // Push memory to server (merge by default, or replace)
  async pushMemory(memory, mode = "merge") {
    const endpoint = `/api/memory`;
    const body = { projectId: this.projectId, mode, memory };
    return await this._request("POST", endpoint, body);
  }

  // Convenience: pull, merge locally, push (full sync)
  async syncNow(localMemory, mode = "replace") {
    const remote = await this.pullMemory();
    // Simple merge: prefer incoming if updatedAt is newer
    const merged = this._mergeMemory(remote, localMemory);
    return await this.pushMemory(merged, mode);
  }

  // Simple local merge (prefer newer by updatedAt)
  _mergeMemory(base, incoming) {
    const baseTime = Date.parse(base?.updatedAt || 0) || 0;
    const incomingTime = Date.parse(incoming?.updatedAt || 0) || 0;
    if (incomingTime >= baseTime) {
      return incoming;
    }
    return base;
  }
}

module.exports = { CoJanetSyncClient };
