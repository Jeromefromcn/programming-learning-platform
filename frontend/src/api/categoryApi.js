import axiosInstance from './axiosInstance';

export const categoryApi = {
  list: () => axiosInstance.get('/v1/categories').then(r => r.data),
  create: (name) => axiosInstance.post('/v1/categories', { name }).then(r => r.data),
  delete: (id) => axiosInstance.delete(`/v1/categories/${id}`),
};
