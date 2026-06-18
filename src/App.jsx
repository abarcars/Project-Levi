import React from "react";
import CoJanetSyncPage from "./pages/CoJanetSyncPage";

export default function App() {
  return (
    <div>
      <header style={{ padding: 16, borderBottom: "1px solid #eee" }}>
        <h1 style={{ margin: 0 }}>Project Levi — Co‑Janet Sync</h1>
      </header>
      <main style={{ padding: 16 }}>
        <CoJanetSyncPage />
      </main>
    </div>
  );
}
