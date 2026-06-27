const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string;
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.accessToken ?? null;
  } catch {
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });

  // Auto-refresh on 401
  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken();

    if (newToken) {
      // Update stored session with new token
      const sessionRes = await chrome.storage.session.get('session');
      if (sessionRes.session) {
        await chrome.storage.session.set({
          session: { ...sessionRes.session, accessToken: newToken },
        });
      }

      // Retry with new token
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
        },
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
      });
    } else {
      // Refresh failed (token expired or cookie unavailable in extension context)
      // Clear in-memory session only — keep persistedAuth so popup shows reunlock
      // instead of full login. User just needs to re-enter master password.
      await chrome.storage.session.remove('session');
      // DO NOT remove persistedAuth here — that would force full login
      throw new Error('SESSION_EXPIRED');
    }
  }

  if (!res.ok) {
    let errMsg = `API error ${res.status}`;
    try {
      const err = await res.json();
      errMsg = err.message ?? err.error ?? errMsg;
    } catch {
      /* ignore */
    }
    throw new Error(errMsg);
  }

  // Handle empty responses (DELETE endpoints return 200 with no body)
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
