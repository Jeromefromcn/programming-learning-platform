import axiosInstance from './axiosInstance';

export const progressApi = {
  getProgress: (page = 0, size = 20) =>
    axiosInstance.get('/v1/student/progress', { params: { page, size } }).then(r => r.data),
};
