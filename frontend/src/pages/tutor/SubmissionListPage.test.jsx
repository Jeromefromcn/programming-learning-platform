import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SubmissionListPage from './SubmissionListPage';
import { submissionApi } from '../../api/submissionApi';

vi.mock('../../api/submissionApi', () => ({
  submissionApi: { list: vi.fn(), delete: vi.fn() },
}));

const emptyPage = { content: [], totalPages: 0 };

beforeEach(() => {
  submissionApi.list = vi.fn().mockResolvedValue(emptyPage);
});

const renderPage = (url = '/') =>
  render(<MemoryRouter initialEntries={[url]}><SubmissionListPage /></MemoryRouter>);

it('does not call submissionApi.list again when student name input changes without clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByPlaceholderText(/filter by student name/i), {
    target: { value: 'alice' },
  });

  expect(submissionApi.list).toHaveBeenCalledTimes(1);
});

it('calls submissionApi.list with studentName after clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByPlaceholderText(/filter by student name/i), {
    target: { value: 'alice' },
  });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(2));
  expect(submissionApi.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ studentName: 'alice', page: 0 })
  );
});

it('calls submissionApi.list after pressing Enter in student name input', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  const input = screen.getByPlaceholderText(/filter by student name/i);
  fireEvent.change(input, { target: { value: 'bob' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(2));
  expect(submissionApi.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ studentName: 'bob' })
  );
});

it('does not call submissionApi.list when exercise ID input changes without clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByPlaceholderText(/filter by exercise id/i), {
    target: { value: '42' },
  });

  expect(submissionApi.list).toHaveBeenCalledTimes(1);
});

it('does not call submissionApi.list when source dropdown changes without clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/source/i), { target: { value: 'STUDENT' } });

  expect(submissionApi.list).toHaveBeenCalledTimes(1);
});

it('calls submissionApi.list with new source after clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/source/i), { target: { value: 'STUDENT' } });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(2));
  expect(submissionApi.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ source: 'STUDENT', page: 0 })
  );
});

it('calls submissionApi.list with IMPORT source by default on mount', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledWith(
    expect.objectContaining({ source: 'IMPORT' })
  ));
});

it('calls submissionApi.list with batchId after clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByPlaceholderText(/filter by batch id/i), {
    target: { value: '42' },
  });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(2));
  expect(submissionApi.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ batchId: '42', page: 0 })
  );
});

it('shows batchId column when submission has batchId', async () => {
  submissionApi.list = vi.fn().mockResolvedValue({
    content: [{
      id: 1, studentName: 'Alice', exerciseTitle: 'Ex1', exerciseType: 'BLOCKLY',
      autoScore: 100, tutorScore: null, graded: false, versionMismatch: false,
      createdAt: '2026-05-01T10:00:00', batchId: 7,
    }],
    totalPages: 1,
  });
  renderPage();

  await waitFor(() => screen.getByText('7'));
  expect(screen.getByText('Batch')).toBeInTheDocument();
});

it('hides batchId cell content when submission has no batchId', async () => {
  submissionApi.list = vi.fn().mockResolvedValue({
    content: [{
      id: 2, studentName: 'Bob', exerciseTitle: 'Ex2', exerciseType: 'PYTHON',
      autoScore: 80, tutorScore: null, graded: false, versionMismatch: false,
      createdAt: '2026-05-02T10:00:00', batchId: null,
    }],
    totalPages: 1,
  });
  renderPage();

  await waitFor(() => screen.getByText('Bob'));
  expect(screen.getByText('Batch')).toBeInTheDocument();
  // The table row for Bob should not contain a batch ID number
  const row = screen.getByText('Bob').closest('tr');
  expect(row.textContent).not.toMatch(/\b\d+\b.*batch/i);
  // More specifically: the batch cell (8th td, 0-indexed) should be empty
  const cells = row.querySelectorAll('td');
  expect(cells[7].textContent.trim()).toBe('');
});

it('does not render an Export CSV button or link', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(/export csv/i)).not.toBeInTheDocument();
});

it('pre-fills batchId and uses all sources when batchId is in the URL', async () => {
  renderPage('/tutor/submissions?batchId=42');
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledWith(
    expect.objectContaining({ batchId: '42', source: '' })
  ));
  expect(screen.getByPlaceholderText(/filter by batch id/i).value).toBe('42');
});

it('does not call submissionApi.list when graded dropdown changes without clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/graded/i), { target: { value: 'true' } });

  expect(submissionApi.list).toHaveBeenCalledTimes(1);
});

it('calls submissionApi.list with graded=true after clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/graded/i), { target: { value: 'true' } });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(2));
  expect(submissionApi.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ graded: 'true', page: 0 })
  );
});
