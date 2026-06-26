import axiosInstance from './axiosInstance';

export const studentApi = {
  listExercises: (params = {}) =>
    axiosInstance.get('/v1/student/exercises', { params }).then(r => r.data),

  getExercise: (id) =>
    axiosInstance.get(`/v1/student/exercises/${id}`).then(r => r.data),

  getDraft: (id) =>
    axiosInstance
      .get(`/v1/student/exercises/${id}/draft`, { validateStatus: (s) => s === 200 || s === 204 })
      .then((r) => (r.status === 204 ? null : r.data)),

  saveDraft: (id, body) =>
    axiosInstance.put(`/v1/student/exercises/${id}/draft`, body).then((r) => r.data),

  submit: (id, body) =>
    axiosInstance.post(`/v1/student/exercises/${id}/submissions`, body).then((r) => r.data),

  getSubmissionHistory: (id) =>
    axiosInstance.get(`/v1/student/exercises/${id}/submissions`).then((r) => r.data),
};
