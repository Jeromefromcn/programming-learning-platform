import axiosInstance from './axiosInstance';

export const progressApi = {
  getProgress: () => axiosInstance.get('/v1/student/progress').then(r => r.data),
};
