import axiosInstance from './axiosInstance';

export const progressApi = {
  getProgress: (params = {}) =>
    axiosInstance.get('/v1/student/progress', { params }).then(r => r.data),
};
