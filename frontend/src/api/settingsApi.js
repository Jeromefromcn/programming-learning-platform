import axiosInstance from './axiosInstance';

export const settingsApi = {
  get: () =>
    axiosInstance.get('/v1/settings').then(r => r.data),
  getImpact: () =>
    axiosInstance.get('/v1/settings/course-filter/impact').then(r => r.data),
  updateCourseFilter: (enabled) =>
    axiosInstance.put('/v1/settings/course-filter', { enabled }).then(r => r.data),
  getMenuConfig: () =>
    axiosInstance.get('/v1/settings/menu-config').then(r => r.data),
  getFullMenuConfig: () =>
    axiosInstance.get('/v1/settings/menu-config/all').then(r => r.data),
  updateMenuConfig: (config) =>
    axiosInstance.put('/v1/settings/menu-config', config).then(r => r.data),
};
