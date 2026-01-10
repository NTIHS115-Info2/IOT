const { randomUUID } = require("crypto");
const WebSocket = require("ws");

const defaults = require("./utils/defaults");
const { buildMockStatus, buildMockIr, buildMockImage } = require("./utils/mock");

const runtime = {
  mode: defaults.mode,
  wsHost: defaults.wsHost,
  wsPort: defaults.wsPort,
  timeoutMs: defaults.timeoutMs,
  retries: defaults.retries,
  retryDelayMs: defaults.retryDelayMs,
  queueLimit: defaults.queueLimit,
  online: false,
  lastError: null,
  server: null,
  currentClient: null,
  pendingRequests: new Map(),
  queue: [],
};

const buildResult = (ok, data, err) => {
  if (ok) {
    return { ok: true, code: "OK", message: "", data };
  }
  return {
    ok: false,
    code: err && err.code ? err.code : "EPLUGIN",
    message: err && err.message ? err.message : "Plugin error",
    data: data || null,
  };
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const flushQueue = () => {
  if (!runtime.currentClient || runtime.currentClient.readyState !== WebSocket.OPEN) {
    return;
  }
  while (runtime.queue.length > 0) {
    const queued = runtime.queue.shift();
    if (!queued) continue;
    runtime.currentClient.send(queued.message);
  }
};

const removeFromQueue = (id) => {
  const index = runtime.queue.findIndex((item) => item.id === id);
  if (index >= 0) {
    runtime.queue.splice(index, 1);
  }
};

const handleClientMessage = (data) => {
  let parsed = null;
  try {
    parsed = JSON.parse(data.toString());
  } catch (error) {
    return;
  }
  if (!parsed || !parsed.id) {
    return;
  }
  const pending = runtime.pendingRequests.get(parsed.id);
  if (!pending) {
    return;
  }
  clearTimeout(pending.timeoutId);
  runtime.pendingRequests.delete(parsed.id);
  pending.resolve(parsed);
};

const wsSendRequest = async (tool, params) => {
  const id = randomUUID();
  const message = JSON.stringify({ id, tool, params: params || {} });

  const promise = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      runtime.pendingRequests.delete(id);
      removeFromQueue(id);
      reject({ code: "ETIMEDOUT", message: "Request timeout" });
    }, runtime.timeoutMs);

    runtime.pendingRequests.set(id, { resolve, reject, timeoutId });

    if (runtime.currentClient && runtime.currentClient.readyState === WebSocket.OPEN) {
      runtime.currentClient.send(message);
      return;
    }

    if (runtime.queue.length >= runtime.queueLimit) {
      clearTimeout(timeoutId);
      runtime.pendingRequests.delete(id);
      reject({ code: "EQUEUEFULL", message: "Queue limit reached" });
      return;
    }

    runtime.queue.push({ id, message });
  });

  return promise;
};

const wsRequestWithRetry = async (tool, params) => {
  let lastError = null;
  for (let attempt = 0; attempt <= runtime.retries; attempt += 1) {
    try {
      const response = await wsSendRequest(tool, params);
      if (response && response.ok === false) {
        return buildResult(false, response.data || null, response);
      }
      return buildResult(true, response ? response.data : null, response);
    } catch (error) {
      lastError = error;
      if (attempt < runtime.retries) {
        await delay(runtime.retryDelayMs);
        continue;
      }
    }
  }
  return buildResult(false, null, lastError || { code: "EWS", message: "Request error" });
};

const handleCameraCapture = async () => {
  if (runtime.mode === "mock") {
    return buildResult(true, buildMockImage());
  }
  return wsRequestWithRetry("camera.capture", {});
};

const handleServoRotate = async (params) => {
  if (runtime.mode === "mock") {
    return buildResult(true, { axis: params.axis, dir: params.dir, step: params.step, ms: params.ms });
  }
  const payload = {
    axis: params.axis,
    dir: params.dir,
  };
  if (Number.isFinite(params.step)) payload.step = params.step;
  if (Number.isFinite(params.ms)) payload.ms = params.ms;
  return wsRequestWithRetry("servo.rotate", payload);
};

const handleIrReceive = async (params) => {
  const action = params && params.action ? params.action : "last";
  if (runtime.mode === "mock") {
    if (action === "last") {
      return buildResult(true, buildMockIr());
    }
    return buildResult(true, { action });
  }
  return wsRequestWithRetry("ir.receive", { action });
};

const handleIrSend = async (params) => {
  if (runtime.mode === "mock") {
    return buildResult(true, params);
  }
  const payload = {
    format: params.format,
  };
  if (Number.isFinite(params.value)) payload.value = params.value;
  if (Number.isFinite(params.bits)) payload.bits = params.bits;
  if (Array.isArray(params.raw)) payload.raw = params.raw;
  return wsRequestWithRetry("ir.send", payload);
};

const handleDeviceStatus = async () => {
  if (runtime.mode === "mock") {
    return buildResult(true, buildMockStatus());
  }
  return wsRequestWithRetry("device.status", {});
};

const validateParams = (tool, params) => {
  if (tool === "servo.rotate") {
    if (!params || !["pan", "tilt"].includes(params.axis)) {
      return { ok: false, message: "axis must be pan or tilt" };
    }
    if (!["cw", "ccw"].includes(params.dir)) {
      return { ok: false, message: "dir must be cw or ccw" };
    }
  }
  if (tool === "ir.receive") {
    const action = params && params.action ? params.action : "last";
    if (!["start", "stop", "last"].includes(action)) {
      return { ok: false, message: "action must be start, stop, or last" };
    }
  }
  if (tool === "ir.send") {
    if (!params || !params.format) {
      return { ok: false, message: "format is required" };
    }
  }
  return { ok: true };
};

const toolHandlers = {
  "camera.capture": handleCameraCapture,
  "servo.rotate": handleServoRotate,
  "ir.receive": handleIrReceive,
  "ir.send": handleIrSend,
  "device.status": handleDeviceStatus,
};

const updateStrategy = async (options) => {
  const next = options || {};
  if (next.mode) runtime.mode = next.mode;
  if (next.wsHost) runtime.wsHost = next.wsHost;
  if (Number.isFinite(next.wsPort)) runtime.wsPort = next.wsPort;
  if (Number.isFinite(next.timeoutMs)) runtime.timeoutMs = next.timeoutMs;
  if (Number.isFinite(next.retries)) runtime.retries = next.retries;
  if (Number.isFinite(next.retryDelayMs)) runtime.retryDelayMs = next.retryDelayMs;
  if (Number.isFinite(next.queueLimit)) runtime.queueLimit = next.queueLimit;
  return buildResult(true, {
    mode: runtime.mode,
    wsHost: runtime.wsHost,
    wsPort: runtime.wsPort,
    timeoutMs: runtime.timeoutMs,
    retries: runtime.retries,
    retryDelayMs: runtime.retryDelayMs,
    queueLimit: runtime.queueLimit,
  });
};

const online = async (options) => {
  if (options) {
    await updateStrategy(options);
  }
  runtime.online = true;
  runtime.lastError = null;
  if (runtime.mode === "mock") {
    return buildResult(true, { mode: runtime.mode });
  }
  if (runtime.server) {
    return buildResult(true, { wsHost: runtime.wsHost, wsPort: runtime.wsPort });
  }

  return new Promise((resolve) => {
    try {
      const server = new WebSocket.Server({ host: runtime.wsHost, port: runtime.wsPort });
      runtime.server = server;

      server.on("connection", (socket) => {
        runtime.currentClient = socket;
        socket.on("message", handleClientMessage);
        socket.on("close", () => {
          if (runtime.currentClient === socket) {
            runtime.currentClient = null;
          }
        });
        socket.on("error", () => {
          if (runtime.currentClient === socket) {
            runtime.currentClient = null;
          }
        });
        flushQueue();
      });

      server.on("error", (error) => {
        runtime.lastError = { code: "EWS", message: error.message };
      });

      server.on("listening", () => {
        resolve(buildResult(true, { wsHost: runtime.wsHost, wsPort: runtime.wsPort }));
      });
    } catch (error) {
      runtime.lastError = { code: "EWS", message: error.message };
      resolve(buildResult(false, null, runtime.lastError));
    }
  });
};

const offline = async () => {
  runtime.online = false;
  runtime.lastError = null;
  runtime.currentClient = null;
  runtime.queue = [];
  for (const [id, pending] of runtime.pendingRequests.entries()) {
    clearTimeout(pending.timeoutId);
    pending.reject({ code: "EWS", message: "Server offline" });
    runtime.pendingRequests.delete(id);
  }

  if (!runtime.server) {
    return buildResult(true, { mode: runtime.mode });
  }

  const server = runtime.server;
  runtime.server = null;

  return new Promise((resolve) => {
    server.close(() => {
      resolve(buildResult(true, { mode: runtime.mode }));
    });
  });
};

const restart = async (options) => {
  await offline();
  return online(options);
};

const state = async () => {
  if (!runtime.online) return 0;
  if (runtime.lastError) return -1;
  return 1;
};

const send = async (payload) => {
  const tool = payload && (payload.tool || payload.name);
  const params = payload && (payload.params || payload.args || {});
  if (!tool || !toolHandlers[tool]) {
    return buildResult(false, null, { code: "ETOOL", message: "Unknown tool" });
  }
  const validation = validateParams(tool, params || {});
  if (!validation.ok) {
    return buildResult(false, null, { code: "EINVAL", message: validation.message });
  }
  return toolHandlers[tool](params || {});
};

module.exports = {
  updateStrategy,
  online,
  offline,
  restart,
  state,
  send,
};
