import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import ProgressPage from './ProgressPage';
import { progressApi } from '../../api/progressApi';

vi.mock('../../api/progressApi', () => ({
  progressApi: { getProgress: vi.fn() },
}));

vi.mock('../../api/axiosInstance', () => ({
  default: {},
  isReauthCancelled: vi.fn().mockReturnValue(false),
}));

vi.mock('../../components/Pagination', () => ({
  default: () => null,
}));

vi.mock('../../components/BlocklySubmissionViewer', () => ({
  default: () => null,
}));

vi.mock('../../utils/dateFormat', () => ({
  formatDate: () => '01/07/2026',
}));

const emptyData = {
  submissions: { content: [], totalPages: 0, totalElements: 0 },
};

beforeEach(() => {
  progressApi.getProgress = vi.fn().mockResolvedValue(emptyData);
});

it('calls progressApi.getProgress once on mount', async () => {
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));
});

it('changing Exercise input alone does not trigger another call', async () => {
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('textbox', { name: /exercise/i }), {
    target: { value: 'hello' },
  });

  expect(progressApi.getProgress).toHaveBeenCalledTimes(1);
});

it('changing Type select alone does not trigger another call', async () => {
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('combobox', { name: /type/i }), {
    target: { value: 'PYTHON' },
  });

  expect(progressApi.getProgress).toHaveBeenCalledTimes(1);
});

it('changing Source select alone does not trigger another call', async () => {
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('combobox', { name: /source/i }), {
    target: { value: 'STUDENT' },
  });

  expect(progressApi.getProgress).toHaveBeenCalledTimes(1);
});

it('clicking Search calls progressApi.getProgress with pending filter values', async () => {
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('textbox', { name: /exercise/i }), {
    target: { value: 'fizz' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: /type/i }), {
    target: { value: 'PYTHON' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: /source/i }), {
    target: { value: 'STUDENT' },
  });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(2));
  expect(progressApi.getProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ exercise: 'fizz', type: 'PYTHON', source: 'STUDENT', page: 0 })
  );
});

it('clicking Search twice with unchanged filters triggers two calls', async () => {
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('combobox', { name: /type/i }), {
    target: { value: 'BLOCKLY' },
  });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(2));

  fireEvent.click(screen.getByRole('button', { name: /search/i }));
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(3));
});
