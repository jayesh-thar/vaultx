// API helper for all fetch calls from the service worker.
// The service worker can fetch freely — no CORS restrictions like a web page.

const API_BASE = 'http://localhost:5000';

// Generic POST
export async function apiPost<T>(
  path: string,
  body: unknown,
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    credentials: 'include', // sends httpOnly refresh-token cookie
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Try to parse error message from your API's standard error shape
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// Generic GET
export async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}
