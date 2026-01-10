const defaults = require("./utils/defaults");
const { request } = require("./utils/httpClient");
const { buildMockStatus, buildMockIr, buildMockImage } = require("./utils/mock");

const runtime = {
  mode: defaults.mode,
  baseURL: defaults.baseURL,
  timeoutMs: defaults.timeoutMs,
  retries: defaults.retries,
  retryDelayMs: defaults.retryDelayMs,
  online: false,
  lastError: null,
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

const normalizeBaseURL = (baseURL) => {
  if (!baseURL) return "";
  return baseURL.endsWith("/") ? baseURL.slice(0, -1) : baseURL;
};

const createClientConfig = () => ({
  timeoutMs: runtime.timeoutMs,
  retries: runtime.retries,
  retryDelayMs: runtime.retryDelayMs,
});

const requestJSON = async (path, method, body) => {
  const base = normalizeBaseURL(runtime.baseURL);
  const url = base + path;
  const options = {
    method,
    headers: { "content-type": "application/json" },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  return request(url, options, createClientConfig());
};

const handleCameraCapture = async () => {
  if (runtime.mode === "mock") {
    return buildResult(true, buildMockImage());
  }
  const res = await requestJSON("/api/camera/capture", "GET");
  if (!res.ok) return buildResult(false, null, res);
  return buildResult(true, res.data);
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
  const res = await requestJSON("/api/servo", "POST", payload);
  if (!res.ok) return buildResult(false, null, res);
  return buildResult(true, res.data);
};

const handleIrReceive = async (params) => {
  if (runtime.mode === "mock") {
    if (params.action === "last") {
      return buildResult(true, buildMockIr());
    }
    return buildResult(true, { action: params.action });
  }
  if (params.action === "start") {
    const res = await requestJSON("/api/ir/receive/start", "POST");
    if (!res.ok) return buildResult(false, null, res);
    return buildResult(true, res.data);
  }
  if (params.action === "stop") {
    const res = await requestJSON("/api/ir/receive/stop", "POST");
    if (!res.ok) return buildResult(false, null, res);
    return buildResult(true, res.data);
  }
  const res = await requestJSON("/api/ir/last", "GET");
  if (!res.ok) return buildResult(false, null, res);
  return buildResult(true, res.data);
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
  const res = await requestJSON("/api/ir/send", "POST", payload);
  if (!res.ok) return buildResult(false, null, res);
  return buildResult(true, res.data);
};

const handleDeviceStatus = async () => {
  if (runtime.mode === "mock") {
    return buildResult(true, buildMockStatus());
  }
  const res = await requestJSON("/api/status", "GET");
  if (!res.ok) return buildResult(false, null, res);
  return buildResult(true, res.data);
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
  if (next.baseURL) runtime.baseURL = next.baseURL;
  if (Number.isFinite(next.timeoutMs)) runtime.timeoutMs = next.timeoutMs;
  if (Number.isFinite(next.retries)) runtime.retries = next.retries;
  if (Number.isFinite(next.retryDelayMs)) runtime.retryDelayMs = next.retryDelayMs;
  return buildResult(true, {
    mode: runtime.mode,
    baseURL: runtime.baseURL,
    timeoutMs: runtime.timeoutMs,
    retries: runtime.retries,
    retryDelayMs: runtime.retryDelayMs,
  });
};

const online = async () => {
  runtime.online = true;
  runtime.lastError = null;
  if (runtime.mode === "mock") {
    return buildResult(true, { mode: runtime.mode });
  }
  const res = await requestJSON("/api/status", "GET");
  if (!res.ok) {
    runtime.lastError = res;
    return buildResult(false, null, res);
  }
  return buildResult(true, res.data);
};

const offline = async () => {
  runtime.online = false;
  runtime.lastError = null;
  return buildResult(true, { mode: runtime.mode });
};

const restart = async (options) => {
  await offline();
  if (options) {
    await updateStrategy(options);
  }
  return online();
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
