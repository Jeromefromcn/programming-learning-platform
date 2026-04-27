import axiosInstance from './axiosInstance';

export const courseApi = {
  list: (page = 0, size = 20) =>
    axiosInstance.get('/v1/courses', { params: { page, size } }).then(r => r.data),

  get: (id) =>
    axiosInstance.get(`/v1/courses/${id}`).then(r => r.data),

  create: (data) =>
    axiosInstance.post('/v1/courses', data).then(r => r.data),

  update: (id, data) =>
    axiosInstance.put(`/v1/courses/${id}`, data).then(r => r.data),

  delete: (id) =>
    axiosInstance.delete(`/v1/courses/${id}`),

  listExercises: (id) =>
    axiosInstance.get(`/v1/courses/${id}/exercises`).then(r => r.data),

  removeExercise: (courseId, exerciseId) =>
    axiosInstance.delete(`/v1/courses/${courseId}/exercises/${exerciseId}`),

  listStudents: (id) =>
    axiosInstance.get(`/v1/courses/${id}/students`).then(r => r.data),

  enrollStudents: (id, userIds) =>
    axiosInstance.post(`/v1/courses/${id}/students`, { userIds }).then(r => r.data),

  removeStudent: (courseId, studentId) =>
    axiosInstance.delete(`/v1/courses/${courseId}/students/${studentId}`),

  searchAvailableStudents: (id, q) =>
    axiosInstance.get(`/v1/courses/${id}/students/available`, { params: { q } }).then(r => r.data),
};
