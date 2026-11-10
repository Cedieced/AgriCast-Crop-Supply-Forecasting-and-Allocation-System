const API_URL = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

function requireApiUrl() {
  if (!API_URL) {
    throw new Error("The API URL is not configured. Set VITE_API_URL to the deployed API base URL.");
  }
  const parsedUrl = new URL(API_URL);
  if (!parsedUrl.pathname.endsWith("/api") || parsedUrl.search || parsedUrl.hash) {
    throw new Error("VITE_API_URL must be an absolute API base URL ending in /api.");
  }
  if (import.meta.env.PROD && parsedUrl.protocol !== "https:") {
    throw new Error("The production API URL must use HTTPS.");
  }
  return API_URL;
}

export async function api(path, { token, ...options } = {}) {
  const apiUrl = requireApiUrl();
  const method = (options.method || "GET").toUpperCase();
  const url = `${apiUrl}${path}`;
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      console.error("AgriCast API request could not reach the server", {
        method,
        url,
        message: error.message,
      });
      throw new Error(
        `Cannot reach the API at ${apiUrl}. Check the API server, network, and CORS configuration.`,
      );
    }
    throw error;
  }
  const contentType = response.headers.get("content-type") || "";
  let body;
  try {
    if (!contentType.toLowerCase().includes("json")) {
      throw new Error(`Unexpected content type: ${contentType || "missing"}`);
    }
    body = await response.json();
  } catch (error) {
    const requestId = response.headers.get("X-Request-Id");
    console.error("AgriCast API returned an invalid response", {
      method,
      url,
      status: response.status,
      contentType,
      requestId,
      message: error.message,
    });
    if (response.ok) {
      throw new Error(`The API returned an invalid JSON response (${response.status})`);
    }
    const message = `Request failed (${response.status})`;
    throw new Error(requestId ? `${message} (request ID: ${requestId})` : message);
  }
  if (!response.ok) {
    const requestId = body.requestId || response.headers.get("X-Request-Id");
    const message = body.error || `Request failed (${response.status})`;
    console.error("AgriCast API request returned an error", {
      method,
      url,
      status: response.status,
      requestId,
      message,
    });
    throw new Error(requestId ? `${message} (request ID: ${requestId})` : message);
  }
  return body;
}

export function subscribeToUpdates(token, onUpdate, onStatus = () => {}) {
  let apiUrl;
  try {
    apiUrl = requireApiUrl();
  } catch (error) {
    onStatus(false, error);
    return () => {};
  }
  const controller = new AbortController();
  let retryDelay = 1000;

  async function connect() {
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(`${apiUrl}/events`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`Live updates unavailable (${response.status})`);
        }
        onStatus(true);
        retryDelay = 1000;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() || "";
          for (const block of blocks) {
            const data = block.split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("\n");
            if (data) onUpdate(JSON.parse(data));
          }
        }
        if (!controller.signal.aborted) throw new Error("Live update connection closed");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("AgriCast live update connection failed", {
          url: `${apiUrl}/events`,
          message: error.message,
        });
        onStatus(false, error);
        await new Promise((resolve) => window.setTimeout(resolve, retryDelay));
        retryDelay = Math.min(retryDelay * 2, 30000);
      }
    }
  }

  connect();
  return () => controller.abort();
}

export { API_URL };
