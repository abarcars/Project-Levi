const React = require("react");
const { useCoJanetMemory } = require("../context/CoJanetMemoryProvider");

function h(type, props) {
  const children = Array.prototype.slice.call(arguments, 2);
  return React.createElement.apply(React, [type, props || {}].concat(children));
}

function CoJanetSyncPage(props) {
  const memoryApi = useCoJanetMemory();
  const [draftMemory, setDraftMemory] = React.useState(
    JSON.stringify(memoryApi.memory || {}, null, 2)
  );
  const [statusMessage, setStatusMessage] = React.useState("");

  React.useEffect(() => {
    setDraftMemory(JSON.stringify(memoryApi.memory || {}, null, 2));
  }, [memoryApi.memory]);

  const runAction = React.useCallback(
    async (label, action) => {
      try {
        const result = await action();
        setStatusMessage(`${label} completed.`);
        return result;
      } catch (error) {
        setStatusMessage(`${label} failed: ${error.message}`);
        return null;
      }
    },
    []
  );

  return h(
    "section",
    { style: { fontFamily: "sans-serif", padding: "1rem", lineHeight: 1.5 } },
    h("h1", null, props.title || "Co-Janet Sync"),
    h(
      "p",
      null,
      "Register a client token once, then use pull, push, and SSE-backed live sync for the selected project."
    ),
    h(
      "div",
      { style: { display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" } },
      h(
        "button",
        {
          type: "button",
          onClick: () => runAction("Registration", () => memoryApi.registerClient())
        },
        "Register client"
      ),
      h(
        "button",
        {
          type: "button",
          onClick: () => runAction("Pull", () => memoryApi.pullRemote())
        },
        "Pull remote"
      ),
      h(
        "button",
        {
          type: "button",
          onClick: () =>
            runAction("Push", () => {
              let parsedDraft;

              try {
                parsedDraft = JSON.parse(draftMemory || "{}");
              } catch (error) {
                throw new Error(`Invalid JSON: ${error.message}`);
              }

              return memoryApi.pushRemote(parsedDraft, "merge");
            })
        },
        "Push local"
      ),
      h(
        "button",
        {
          type: "button",
          onClick: () => runAction("Sync", () => memoryApi.syncNow())
        },
        "Sync now"
      )
    ),
    h(
      "p",
      null,
      `Registered: ${memoryApi.syncState.registered ? "yes" : "no"} | Subscribed: ${
        memoryApi.syncState.subscribed ? "yes" : "no"
      } | Last sync: ${memoryApi.syncState.lastSyncAt || "never"}`
    ),
    h("p", null, statusMessage || memoryApi.syncState.error || "Idle"),
    h(
      "p",
      null,
      `Client: ${
        memoryApi.client
          ? `${memoryApi.client.clientName} (${memoryApi.client.clientId})`
          : "not registered"
      }`
    ),
    h(
      "label",
      { style: { display: "block", marginBottom: "0.5rem", fontWeight: 600 } },
      "Editable local memory JSON"
    ),
    h("textarea", {
      value: draftMemory,
      onChange: (event) => setDraftMemory(event.target.value),
      rows: props.rows || 20,
      style: { width: "100%", fontFamily: "monospace" }
    }),
    h(
      "p",
      { style: { marginTop: "1rem" } },
      "Security note: keep the admin registration token on the server or in local-only developer tooling. Do not ship it in public browser bundles."
    )
  );
}

module.exports = {
  CoJanetSyncPage
};
