const React = require("react");
const {
  registerClient: registerRemoteClient,
  pullRemote: pullRemoteMemory,
  pushRemote: pushRemoteMemory,
  subscribe: subscribeToRemoteMemory
} = require("../lib/cojanetSyncClient");

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
    sync: {
      ...(left.sync || {}),
      ...(right.sync || {})
    }
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

  return merged;
}

function getStorageValue(key) {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
}

function setStorageValue(key, value) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

const defaultContextValue = {
  memory: {},
  client: null,
  peers: [],
  syncState: {
    registered: false,
    subscribed: false,
    lastSyncAt: null,
    error: null
  },
  setMemory: () => {},
  registerClient: async () => null,
  pullRemote: async () => null,
  pushRemote: async () => null,
  syncNow: async () => null
};

const CoJanetMemoryContext = React.createContext(defaultContextValue);

function CoJanetMemoryProvider(props) {
  const {
    children,
    initialMemory,
    serverUrl,
    adminToken,
    projectId,
    clientName,
    storageKey
  } = props;

  const localStorageKey =
    storageKey || `cojanet-sync:${projectId || "default"}:client`;
  const initialClient =
    (projectId && getStorageValue(localStorageKey)) || null;
  const [memory, setMemory] = React.useState(initialMemory || {});
  const [client, setClient] = React.useState(initialClient);
  const peers = [];
  const [syncState, setSyncState] = React.useState({
    registered: Boolean(initialClient),
    subscribed: false,
    lastSyncAt: null,
    error: null
  });

  const subscriptionRef = React.useRef(null);

  const updateSyncState = React.useCallback((patch) => {
    setSyncState((current) => ({
      ...current,
      ...patch
    }));
  }, []);

  const applyRemoteMemory = React.useCallback(
    (incoming) => {
      if (!incoming) {
        return;
      }

      setMemory((current) => mergeMemoryObjects(current, incoming));
      updateSyncState({
        lastSyncAt: new Date().toISOString(),
        error: null
      });
    },
    [updateSyncState]
  );

  const subscribeClient = React.useCallback(
    (registration) => {
      if (!serverUrl || !projectId || !registration || !registration.clientToken) {
        return null;
      }

      if (subscriptionRef.current) {
        subscriptionRef.current();
      }

      subscriptionRef.current = subscribeToRemoteMemory(
        serverUrl,
        projectId,
        registration.clientToken,
        (incoming, error) => {
          if (error) {
            updateSyncState({
              error: error.message,
              subscribed: false
            });
            return;
          }

          updateSyncState({
            subscribed: true
          });
          applyRemoteMemory(incoming);
        }
      );

      updateSyncState({
        subscribed: true,
        error: null
      });

      return subscriptionRef.current;
    },
    [applyRemoteMemory, projectId, serverUrl, updateSyncState]
  );

  React.useEffect(() => {
    if (!client) {
      return undefined;
    }

    const unsubscribe = subscribeClient(client);
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [client, subscribeClient]);

  React.useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current();
      }
    };
  }, []);

  const registerClient = React.useCallback(async () => {
    if (!serverUrl || !projectId) {
      throw new Error("serverUrl and projectId are required");
    }

    const registration = await registerRemoteClient(
      serverUrl,
      adminToken,
      projectId,
      clientName
    );

    setStorageValue(localStorageKey, registration);
    setClient(registration);
    updateSyncState({
      registered: true,
      error: null
    });
    subscribeClient(registration);
    return registration;
  }, [
    adminToken,
    clientName,
    localStorageKey,
    projectId,
    serverUrl,
    subscribeClient,
    updateSyncState
  ]);

  const pullRemote = React.useCallback(async () => {
    const token = client && client.clientToken;
    if (!serverUrl || !projectId || !token) {
      throw new Error("A registered client token is required");
    }

    const remote = await pullRemoteMemory(serverUrl, projectId, token);
    applyRemoteMemory(remote);
    return remote;
  }, [applyRemoteMemory, client, projectId, serverUrl]);

  const pushRemote = React.useCallback(
    async (nextMemory, mode) => {
      const token = client && client.clientToken;
      if (!serverUrl || !projectId || !token) {
        throw new Error("A registered client token is required");
      }

      const remote = await pushRemoteMemory(
        serverUrl,
        projectId,
        token,
        nextMemory || memory,
        mode || "merge"
      );
      applyRemoteMemory(remote);
      return remote;
    },
    [applyRemoteMemory, client, memory, projectId, serverUrl]
  );

  const syncNow = React.useCallback(async () => {
    const remote = await pullRemote();
    updateSyncState({
      lastSyncAt: new Date().toISOString()
    });
    return remote;
  }, [pullRemote, updateSyncState]);

  const contextValue = React.useMemo(
    () => ({
      memory,
      client,
      peers,
      syncState,
      setMemory,
      registerClient,
      pullRemote,
      pushRemote,
      syncNow
    }),
    [client, memory, peers, pullRemote, pushRemote, registerClient, syncNow, syncState]
  );

  return React.createElement(
    CoJanetMemoryContext.Provider,
    { value: contextValue },
    children
  );
}

function useCoJanetMemory() {
  return React.useContext(CoJanetMemoryContext);
}

module.exports = {
  CoJanetMemoryContext,
  CoJanetMemoryProvider,
  mergeMemoryObjects,
  useCoJanetMemory
};
