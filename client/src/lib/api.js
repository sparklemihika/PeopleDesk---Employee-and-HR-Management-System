const API_BASE = import.meta.env.VITE_API_URL || "";

export function getToken() {
  return localStorage.getItem("peopledesk_token");
}

export function setToken(token) {
  if (token) localStorage.setItem("peopledesk_token", token);
  else localStorage.removeItem("peopledesk_token");
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}/api${path}`, { ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") {
      setToken(null);
      window.dispatchEvent(new Event("peopledesk:auth-expired"));
    }
    throw new Error(result.message || "The request could not be completed.");
  }
  return result;
}

export async function download(path, filename) {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE}/api${path}`, { headers });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || "The download could not be completed.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
