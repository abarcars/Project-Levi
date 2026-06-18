import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { CoJanetMemoryProvider } from "./context/CoJanetMemoryProvider";
import "./styles.css";

const serverUrl = import.meta.env.VITE_COJANET_SERVER_URL || "http://localhost:8787";
const adminToken = import.meta.env.VITE_COJANET_ADMIN_TOKEN || "";
const clientToken = import.meta.env.VITE_COJANET_CLIENT_TOKEN || "";
const projectId = import.meta.env.VITE_COJANET_PROJECT_ID || "career-ops";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CoJanetMemoryProvider
      projectId={projectId}
      syncConfig={{ serverUrl, adminToken, token: clientToken }}
    >
      <App />
    </CoJanetMemoryProvider>
  </React.StrictMode>
);
