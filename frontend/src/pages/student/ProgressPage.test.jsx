import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

const dataWithGradedSubmissions = {
  submissions: {
    content: [
      { submissionId: 1, exerciseId: 10, exerciseTitle: 'Loops', exerciseType: 'PYTHON', source: 'STUDENT', score: 70, graded: true, tutorScore: 85, tutorComment: 'Nice work, watch indentation.', createdAt: '2026-07-01T10:00:00' },
      { submissionId: 2, exerciseId: 11, exerciseTitle: 'Arrays', exerciseType: 'PYTHON', source: 'STUDENT', score: 40, graded: true, tutorScore: 35, tutorComment: null, createdAt: '2026-07-01T10:00:00' },
    ],
    totalPages: 1,
    totalElements: 2,
  },
};

const dataWithGradedButNullScore = {
  submissions: {
    content: [
      { submissionId: 3, exerciseId: 13, exerciseTitle: 'Strings', exerciseType: 'PYTHON', source: 'STUDENT', score: 50, graded: true, tutorScore: null, tutorComment: 'Needs revision', createdAt: '2026-07-01T10:00:00' },
    ],
    totalPages: 1,
    totalElements: 1,
  },
};

it('renders "Tutor Grade" column header immediately after "Auto Grade"', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithSubmissions);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
  expect(headers.indexOf('Tutor Grade')).toBe(headers.indexOf('Auto Grade') + 1);
});

it('shows an em dash in Tutor Grade for an ungraded submission', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithSubmissions);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  const rows = screen.getAllByRole('row').slice(1);
  const loopsRow = rows.find(r => r.textContent.includes('Loops'));
  const tutorCell = loopsRow.querySelectorAll('td')[4];
  expect(tutorCell.textContent).toBe('—');
});

it('shows a tutor score chip and comment button when graded with a comment', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithGradedSubmissions);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  const rows = screen.getAllByRole('row').slice(1);
  const loopsRow = rows.find(r => r.textContent.includes('Loops'));
  const tutorCell = loopsRow.querySelectorAll('td')[4];
  expect(tutorCell.textContent).toContain('85.0');
  expect(within(loopsRow).getByRole('button', { name: /view tutor comment/i })).toBeInTheDocument();
});

it('hides the comment button when graded with no comment', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithGradedSubmissions);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  const rows = screen.getAllByRole('row').slice(1);
  const arraysRow = rows.find(r => r.textContent.includes('Arrays'));
  expect(within(arraysRow).queryByRole('button', { name: /view tutor comment/i })).not.toBeInTheDocument();
});

it('clicking the comment button opens a modal with the comment text, without navigating to the detail view', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithGradedSubmissions);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  fireEvent.click(screen.getByRole('button', { name: /view tutor comment/i }));

  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('Nice work, watch indentation.')).toBeInTheDocument();
  expect(screen.queryByText('← Back to My Progress')).not.toBeInTheDocument();
});

it('closing the tutor comment modal removes it', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithGradedSubmissions);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  fireEvent.click(screen.getByRole('button', { name: /view tutor comment/i }));
  fireEvent.click(screen.getByRole('button', { name: /close/i }));

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('shows an em dash in Tutor Grade when graded but tutorScore is null', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithGradedButNullScore);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  const rows = screen.getAllByRole('row').slice(1);
  const stringsRow = rows.find(r => r.textContent.includes('Strings'));
  const tutorCell = stringsRow.querySelectorAll('td')[4];
  expect(tutorCell.textContent).toBe('—');
});
