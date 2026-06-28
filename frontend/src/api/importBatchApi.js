import axiosInstance from './axiosInstance';

export const importBatchApi = {
  list: (params) =>
    axiosInstance.get('/v1/import-batches', { params }).then(r => r.data),
  delete: (id) =>
    axiosInstance.delete(`/v1/import-batches/${id}`).then(r => r.data),
};

export async function downloadBatchExport(batchId) {
  const response = await axiosInstance.get(`/v1/import-batches/${batchId}/export`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `batch_${batchId}_export.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
