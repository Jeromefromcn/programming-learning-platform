import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import GroupSubmissionPage from './GroupSubmissionPage';
import { importBatchApi, downloadBatchExport } from '../../api/importBatchApi';

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
  downloadBatchExport.mockClear();
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

it('re-fetches gradedStatus before export and skips the confirm dialog when the fresh status is ALL', async () => {
  importBatchApi.list = vi.fn()
    .mockResolvedValueOnce({ content: [batch(1, 'PARTIAL')], totalPages: 1 })
    .mockResolvedValueOnce({ content: [batch(1, 'ALL')], totalPages: 1 });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /export csv/i }));

  fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

  await waitFor(() => expect(downloadBatchExport).toHaveBeenCalledWith(1));
  expect(window.confirm).not.toHaveBeenCalled();
  expect(importBatchApi.list).toHaveBeenLastCalledWith({ batchId: 1, page: 0, size: 1 });
});

it('shows the confirm dialog when the fresh status is PARTIAL even though the page state says ALL', async () => {
  importBatchApi.list = vi.fn()
    .mockResolvedValueOnce({ content: [batch(2, 'ALL')], totalPages: 1 })
    .mockResolvedValueOnce({ content: [batch(2, 'PARTIAL')], totalPages: 1 });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /export csv/i }));

  fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

  await waitFor(() => expect(window.confirm).toHaveBeenCalledWith(
    expect.stringContaining('Not all submissions in this batch are graded')
  ));
  expect(downloadBatchExport).toHaveBeenCalledWith(2);
});

it('does not export when the tutor cancels the confirm dialog for a fresh PARTIAL status', async () => {
  window.confirm.mockReturnValue(false);
  importBatchApi.list = vi.fn()
    .mockResolvedValueOnce({ content: [batch(3, 'ALL')], totalPages: 1 })
    .mockResolvedValueOnce({ content: [batch(3, 'PARTIAL')], totalPages: 1 });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /export csv/i }));

  fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

  await waitFor(() => expect(importBatchApi.list).toHaveBeenCalledTimes(2));
  expect(downloadBatchExport).not.toHaveBeenCalled();
});

it('alerts and does not export when the fresh status fetch fails', async () => {
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  importBatchApi.list = vi.fn()
    .mockResolvedValueOnce({ content: [batch(4, 'ALL')], totalPages: 1 })
    .mockRejectedValueOnce(new Error('network error'));
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /export csv/i }));

  fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

  await waitFor(() => expect(window.alert).toHaveBeenCalledWith(
    'Failed to check batch status. Please try again.'
  ));
  expect(downloadBatchExport).not.toHaveBeenCalled();
});

it('shows a checking state on the export button while the fresh-status fetch is pending', async () => {
  let resolveFresh;
  const freshPromise = new Promise(resolve => { resolveFresh = resolve; });
  importBatchApi.list = vi.fn()
    .mockResolvedValueOnce({ content: [batch(5, 'ALL')], totalPages: 1 })
    .mockReturnValueOnce(freshPromise);
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /export csv/i }));

  fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

  await waitFor(() => expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled());

  resolveFresh({ content: [batch(5, 'ALL')], totalPages: 1 });
  await waitFor(() => expect(downloadBatchExport).toHaveBeenCalledWith(5));
});
