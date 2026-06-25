import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

let getToken = () => null;
let onUnauthorized = () => {};

export function setAuthHandlers(tokenGetter, unauthorizedHandler) {
  getToken = tokenGetter;
  onUnauthorized = unauthorizedHandler;
}

axiosInstance.interceptors.request.use(config => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
// Each entry: { onToken: (token: string) => void, reject: (err: Error) => void }
let pendingRequests = [];

// Requests waiting for the user to re-authenticate via the modal
let reauthQueue = [];
let isWaitingReauth = false;

export function resolveReauthQueue(newToken) {
  isWaitingReauth = false;
  const queue = reauthQueue;
  reauthQueue = [];
  queue.forEach(({ config, resolve }) => {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${newToken}`;
    resolve(axiosInstance(config));
  });
}

export function rejectReauthQueue() {
  isWaitingReauth = false;
  const queue = reauthQueue;
  reauthQueue = [];
  queue.forEach(({ reject }) => reject(new Error('REAUTH_CANCELLED')));
}

export function isReauthCancelled(err) {
  return err?.message === 'REAUTH_CANCELLED';
}

axiosInstance.interceptors.response.use(
  response => response,
  async error => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url?.includes('/v1/auth/')) {
      original._retry = true;
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const res = await axiosInstance.post('/v1/auth/refresh');
          const newToken = res.data.accessToken;
          pendingRequests.forEach(({ onToken }) => onToken(newToken));
          pendingRequests = [];
          return axiosInstance(original);
        } catch (_) {
          // Drain concurrent requests: reject them so callers get REAUTH_CANCELLED
          pendingRequests.forEach(({ reject }) => reject(new Error('REAUTH_CANCELLED')));
          pendingRequests = [];
          // Queue this request and signal that reauth is needed
          if (!isWaitingReauth) {
            isWaitingReauth = true;
            onUnauthorized();
          }
          return new Promise((resolve, reject) => {
            reauthQueue.push({ config: original, resolve, reject });
          });
        } finally {
          isRefreshing = false;
        }
      }
      // Concurrent request during active refresh — wait for the outcome
      return new Promise((resolve, reject) => {
        pendingRequests.push({
          onToken: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(axiosInstance(original));
          },
          reject,
        });
      });
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
