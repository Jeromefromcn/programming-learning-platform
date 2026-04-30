import axiosInstance from './axiosInstance';

export const exerciseApi = {
  list: (params = {}) =>
    axiosInstance.get('/v1/exercises', { params }).then(r => r.data),

  get: (id) =>
    axiosInstance.get(`/v1/exercises/${id}`).then(r => r.data),

  create: (data) =>
    axiosInstance.post('/v1/exercises', data).then(r => r.data),

  update: (id, data) =>
    axiosInstance.put(`/v1/exercises/${id}`, data).then(r => r.data),

  delete: (id) =>
    axiosInstance.delete(`/v1/exercises/${id}`),

  publish: (id) =>
    axiosInstance.patch(`/v1/exercises/${id}/publish`).then(r => r.data),

  unpublish: (id) =>
    axiosInstance.patch(`/v1/exercises/${id}/unpublish`).then(r => r.data),

  listVersions: (id) =>
    axiosInstance.get(`/v1/exercises/${id}/versions`).then(r => r.data),

  getVersion: (id, versionId) =>
    axiosInstance.get(`/v1/exercises/${id}/versions/${versionId}`).then(r => r.data),

  rollback: (id, versionId) =>
    axiosInstance.post(`/v1/exercises/${id}/rollback`, { versionId }).then(r => r.data),

  verify: (data) =>
    axiosInstance.post('/v1/exercises/verify', data).then(r => r.data),
};
