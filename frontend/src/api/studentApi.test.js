import { describe, it, expect, vi, beforeEach } from 'vitest';
import axiosInstance from './axiosInstance';
import { studentApi } from './studentApi';

vi.mock('./axiosInstance');

describe('studentApi draft & submit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getDraft returns data on 200', async () => {
    axiosInstance.get.mockResolvedValue({ status: 200, data: { answerData: 'x' } });
    const res = await studentApi.getDraft(5);
    expect(axiosInstance.get).toHaveBeenCalledWith('/v1/student/exercises/5/draft', { validateStatus: expect.any(Function) });
    expect(res).toEqual({ answerData: 'x' });
  });

  it('getDraft returns null on 204', async () => {
    axiosInstance.get.mockResolvedValue({ status: 204, data: '' });
    expect(await studentApi.getDraft(5)).toBeNull();
  });

  it('saveDraft PUTs the body', async () => {
    axiosInstance.put.mockResolvedValue({ data: { answerData: 'y' } });
    const res = await studentApi.saveDraft(5, { answerData: 'y' });
    expect(axiosInstance.put).toHaveBeenCalledWith('/v1/student/exercises/5/draft', { answerData: 'y' });
    expect(res).toEqual({ answerData: 'y' });
  });

  it('submit POSTs the body', async () => {
    axiosInstance.post.mockResolvedValue({ data: { submissionId: 1, showResult: true, score: 100, passed: true } });
    const res = await studentApi.submit(5, { answerData: 'z' });
    expect(axiosInstance.post).toHaveBeenCalledWith('/v1/student/exercises/5/submissions', { answerData: 'z' });
    expect(res.passed).toBe(true);
  });
});
