import axiosInstance from './axiosInstance';

export const studentApi = {
  listExercises: (params = {}) =>
    axiosInstance.get('/v1/student/exercises', { params }).then(r => r.data),

  getExercise: (id) =>
    axiosInstance.get(`/v1/student/exercises/${id}`).then(r => r.data),
};
