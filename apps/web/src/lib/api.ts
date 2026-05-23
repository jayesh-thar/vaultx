import axios from 'axios';

// Stored at module level — avoids circular import with the store
let _accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  _accessToken = token;
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  withCredentials: true, // needed to send the httpOnly refresh token cookie
});

// Attach access token to every outgoing request
api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

// Auto-refresh logic
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(undefined);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      // ← ADD THIS: don't intercept auth endpoints
      // 401 on login/register means wrong credentials, not expired token
      if (original.url?.includes('/auth/')) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(original))
          .catch((err) => Promise.reject(err));
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const res = await api.post<{ accessToken: string }>(
          '/api/auth/refresh'
        );
        setAccessToken(res.data.accessToken);
        processQueue(null);
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError);
        const { useVaultStore } = await import('../store/useVaultStore');
        useVaultStore.getState().clearSession();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
