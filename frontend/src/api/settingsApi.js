import axiosInstance from './axiosInstance';

export const settingsApi = {
  get: () =>
    axiosInstance.get('/v1/settings').then(r => r.data),
  getImpact: () =>
    axiosInstance.get('/v1/settings/course-filter/impact').then(r => r.data),
  updateCourseFilter: (enabled) =>
    axiosInstance.put('/v1/settings/course-filter', { enabled }).then(r => r.data),
};
