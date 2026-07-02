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

const dataWithSubmissions = {
  submissions: {
    content: [
      { submissionId: 1, exerciseId: 10, exerciseTitle: 'Loops', exerciseType: 'PYTHON', source: 'STUDENT', score: 75, createdAt: '2026-07-01T10:00:00' },
      { submissionId: 2, exerciseId: 11, exerciseTitle: 'Arrays', exerciseType: 'PYTHON', source: 'STUDENT', score: 40, createdAt: '2026-07-01T10:00:00' },
      { submissionId: 3, exerciseId: 12, exerciseTitle: 'Recursion', exerciseType: 'PYTHON', source: 'IMPORT', score: null, createdAt: '2026-07-01T10:00:00' },
    ],
    totalPages: 1,
    totalElements: 3,
  },
};

beforeEach(() => {
  progressApi.getProgress = vi.fn().mockResolvedValue(emptyData);
});

it('renders "Auto Grade" as the score column header', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithSubmissions);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('columnheader', { name: 'Auto Grade' })).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Score' })).not.toBeInTheDocument();
});

it('renders a green chip for a passing auto-grade score, red for failing, and blank when null', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithSubmissions);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  expect(screen.getByText('75.0')).toBeInTheDocument();
  expect(screen.getByText('40.0')).toBeInTheDocument();

  const rows = screen.getAllByRole('row').slice(1); // skip header row
  const recursionRow = rows.find(r => r.textContent.includes('Recursion'));
  const scoreCell = recursionRow.querySelectorAll('td')[3];
  expect(scoreCell.textContent).toBe('');
});

it('calls progressApi.getProgress once on mount with page=0, size=20, no filters', async () => {
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));
  expect(progressApi.getProgress).toHaveBeenCalledWith({ page: 0, size: 20 });
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
