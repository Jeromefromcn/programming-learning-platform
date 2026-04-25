import axiosInstance from './axiosInstance';

export const authApi = {
  login: (username, password) =>
    axiosInstance.post('/v1/auth/login', { username, password }).then(r => r.data),

  logout: () =>
    axiosInstance.post('/v1/auth/logout'),

  refresh: () =>
    axiosInstance.post('/v1/auth/refresh').then(r => r.data),

  me: () =>
    axiosInstance.get('/v1/auth/me').then(r => r.data),
};
