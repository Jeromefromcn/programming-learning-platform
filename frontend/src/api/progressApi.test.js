import { describe, it, expect, vi, beforeEach } from 'vitest';
import axiosInstance from './axiosInstance';
import { progressApi } from './progressApi';

vi.mock('./axiosInstance');

describe('progressApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getProgress with no args sends an empty params object', async () => {
    axiosInstance.get.mockResolvedValue({ data: { submissions: { content: [] } } });

    await progressApi.getProgress();

    expect(axiosInstance.get).toHaveBeenCalledWith('/v1/student/progress', { params: {} });
  });

  it('getProgress with explicit page/size sends those params', async () => {
    axiosInstance.get.mockResolvedValue({ data: { submissions: { content: [] } } });

    await progressApi.getProgress({ page: 0, size: 20 });

    expect(axiosInstance.get).toHaveBeenCalledWith('/v1/student/progress', {
      params: { page: 0, size: 20 },
    });
  });

  it('getProgress passes exercise/type/source filter params through', async () => {
    axiosInstance.get.mockResolvedValue({ data: { submissions: { content: [] } } });

    await progressApi.getProgress({ page: 0, size: 20, exercise: 'fizz', type: 'PYTHON', source: 'STUDENT' });

    expect(axiosInstance.get).toHaveBeenCalledWith('/v1/student/progress', {
      params: { page: 0, size: 20, exercise: 'fizz', type: 'PYTHON', source: 'STUDENT' },
    });
  });

  it('getProgress returns the response data', async () => {
    const mockData = { submissions: { content: [{ exerciseId: 1 }], totalElements: 1 } };
    axiosInstance.get.mockResolvedValue({ data: mockData });

    const result = await progressApi.getProgress({ page: 0, size: 20 });

    expect(result).toEqual(mockData);
  });
});
