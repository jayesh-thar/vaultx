const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string;
}

async function refreshAccessToken(): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  try {
    const stored = await chrome.storage.local.get('persistedAuth');
    const refreshToken = stored.persistedAuth?.refreshToken;

    if (!refreshToken) return null;

    const res = await fetch(`${API_BASE}/api/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      // NO credentials: 'include' — we're using body, not cookie
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.accessToken || !data.refreshToken) return null;

    return { accessToken: data.accessToken, refreshToken: data.refreshToken };
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
    const tokens = await refreshAccessToken();

    if (tokens) {
      // Store both new tokens
      const stored = await chrome.storage.local.get('persistedAuth');
      await chrome.storage.local.set({
        persistedAuth: {
          ...stored.persistedAuth,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken, // rotate stored refresh token
        },
      });

      // Retry original request with new access token
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens.accessToken}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } else {
      // Refresh failed — clear only in-memory session, keep local for reunlock
      await chrome.storage.session.remove('session');
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
