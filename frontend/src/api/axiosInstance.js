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
let pendingRequests = [];

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
          pendingRequests.forEach(cb => cb(newToken));
          pendingRequests = [];
          return axiosInstance(original);
        } catch (_) {
          onUnauthorized();
          return Promise.reject(error);
        } finally {
          isRefreshing = false;
        }
      }
      return new Promise(resolve => {
        pendingRequests.push(token => {
          original.headers.Authorization = `Bearer ${token}`;
          resolve(axiosInstance(original));
        });
      });
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
