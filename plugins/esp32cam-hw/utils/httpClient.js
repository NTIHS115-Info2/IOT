const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeError = (error) => {
  if (error && error.name === "AbortError") {
    return { code: "ETIMEDOUT", message: "Request timeout" };
  }
  if (error && error.code) {
    return { code: String(error.code), message: error.message || "Request error" };
  }
  return { code: "EHTTP", message: error ? error.message : "Request error" };
};

const buildResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  let data = null;
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else if (contentType.includes("text/")) {
    data = await response.text();
  } else {
    data = await response.arrayBuffer();
  }
  return data;
};

const request = async (url, options, config) => {
  const timeoutMs = config.timeoutMs;
  const retries = config.retries;
  const retryDelayMs = config.retryDelayMs;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(id);
      const data = await buildResponse(response);
      if (!response.ok) {
        return {
          ok: false,
          code: "HTTP_" + response.status,
          message: response.statusText || "HTTP error",
          data,
        };
      }
      return { ok: true, code: "OK", message: "", data };
    } catch (error) {
      clearTimeout(id);
      lastError = normalizeError(error);
      if (attempt < retries) {
        await delay(retryDelayMs);
        continue;
      }
      return {
        ok: false,
        code: lastError.code,
        message: lastError.message,
        data: null,
      };
    }
  }

  return {
    ok: false,
    code: lastError ? lastError.code : "EHTTP",
    message: lastError ? lastError.message : "Request error",
    data: null,
  };
};

module.exports = {
  request,
};
