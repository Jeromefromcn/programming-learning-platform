import axiosInstance from './axiosInstance';

export const userApi = {
  list: (params) =>
    axiosInstance.get('/v1/users', { params }).then(r => r.data),
  create: (data) =>
    axiosInstance.post('/v1/users', data).then(r => r.data),
  updateRole: (id, role) =>
    axiosInstance.patch(`/v1/users/${id}/role`, { role }).then(r => r.data),
  updateStatus: (id, status) =>
    axiosInstance.patch(`/v1/users/${id}/status`, { status }).then(r => r.data),
};
