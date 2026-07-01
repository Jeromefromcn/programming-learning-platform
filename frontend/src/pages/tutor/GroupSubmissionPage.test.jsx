import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import GroupSubmissionPage from './GroupSubmissionPage';
import { importBatchApi } from '../../api/importBatchApi';

vi.mock('../../api/importBatchApi', () => ({
  importBatchApi: { list: vi.fn(), delete: vi.fn() },
  downloadBatchExport: vi.fn(),
}));

const mockOpenTabAt = vi.fn();
vi.mock('../../contexts/TabContext', () => ({
  useTab: () => ({ openTabAt: mockOpenTabAt }),
}));

const batch = (id, gradedStatus, importedCount = 3) => ({
  id,
  createdAt: '2026-06-01T10:00:00',
  fileCount: importedCount,
  importedCount,
  duplicateCount: 0,
  failedCount: 0,
  gradedStatus,
});

beforeEach(() => {
  importBatchApi.list = vi.fn().mockResolvedValue({ content: [], totalPages: 0 });
  importBatchApi.delete = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  mockOpenTabAt.mockClear();
});

afterEach(() => vi.restoreAllMocks());

const renderPage = () => render(<MemoryRouter><GroupSubmissionPage /></MemoryRouter>);

it('renders a Delete button for each batch row', async () => {
  importBatchApi.list = vi.fn().mockResolvedValue({
    content: [batch(1, 'NONE')],
    totalPages: 1,
  });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /^delete$/i }));
  expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
});

it('confirmation message includes submission count', async () => {
  importBatchApi.list = vi.fn().mockResolvedValue({
    content: [batch(1, 'NONE', 7)],
    totalPages: 1,
  });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /^delete$/i }));

  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('7'));
});

it('confirmation message includes graded warning when gradedStatus is ALL', async () => {
  importBatchApi.list = vi.fn().mockResolvedValue({
    content: [batch(2, 'ALL', 5)],
    totalPages: 1,
  });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /^delete$/i }));

  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

  expect(window.confirm).toHaveBeenCalledWith(
    expect.stringContaining('fully graded')
  );
});

it('calls importBatchApi.delete with batch id when user confirms', async () => {
  importBatchApi.list = vi.fn().mockResolvedValue({
    content: [batch(3, 'PARTIAL', 4)],
    totalPages: 1,
  });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /^delete$/i }));

  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

  await waitFor(() => expect(importBatchApi.delete).toHaveBeenCalledWith(3));
});

it('does not call importBatchApi.delete when user cancels', async () => {
  window.confirm.mockReturnValue(false);
  importBatchApi.list = vi.fn().mockResolvedValue({
    content: [batch(4, 'NONE', 2)],
    totalPages: 1,
  });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /^delete$/i }));

  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

  expect(importBatchApi.delete).not.toHaveBeenCalled();
});

it('View Submissions button navigates to submissions page filtered by batch id', async () => {
  importBatchApi.list = vi.fn().mockResolvedValue({
    content: [batch(5, 'PARTIAL')],
    totalPages: 1,
  });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /view submissions/i }));

  fireEvent.click(screen.getByRole('button', { name: /view submissions/i }));

  expect(mockOpenTabAt).toHaveBeenCalledWith('submissions', '/tutor/submissions?batchId=5');
});
