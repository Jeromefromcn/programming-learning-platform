import axiosInstance from './axiosInstance';

export const submissionApi = {
  importFiles: (formData) =>
    axiosInstance.post('/v1/submissions/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  forceImport: (batchId, filename) =>
    axiosInstance.post('/v1/submissions/import-duplicate', { batchId, filename }).then(r => r.data),

  list: (params) =>
    axiosInstance.get('/v1/submissions', { params }).then(r => r.data),

  getById: (id) =>
    axiosInstance.get(`/v1/submissions/${id}`).then(r => r.data),

  grade: (id, payload) =>
    axiosInstance.put(`/v1/submissions/${id}/grade`, payload).then(r => r.data),

  delete: (id) =>
    axiosInstance.delete(`/v1/submissions/${id}`).then(r => r.data),

  previewPurge: (params) =>
    axiosInstance.get('/v1/submissions/purge/preview', { params }).then(r => r.data),

  purge: (params) =>
    axiosInstance.delete('/v1/submissions/purge', { params }).then(r => r.data),
};

// CSV export uses a plain <a href> — no Axios call needed; the endpoint is unauthenticated.
export const csvExportUrl = (exerciseId) => {
  const base = '/api/v1/submissions/export-csv';
  return exerciseId ? `${base}?exerciseId=${exerciseId}` : base;
};
