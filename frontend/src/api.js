const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export async function api(path, { token, ...options } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

export function subscribeToUpdates(token, onUpdate, onStatus = () => {}) {
  const controller = new AbortController();
  let retryDelay = 1000;

  async function connect() {
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(`${API_URL}/events`, {
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
