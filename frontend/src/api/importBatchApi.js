import axiosInstance from './axiosInstance';

export const importBatchApi = {
  list: (params) =>
    axiosInstance.get('/v1/import-batches', { params }).then(r => r.data),
};

export const batchExportUrl = (batchId) =>
  `/api/v1/import-batches/${batchId}/export`;
