import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SubmissionListPage from './SubmissionListPage';
import { submissionApi } from '../../api/submissionApi';

vi.mock('../../api/submissionApi', () => ({
  submissionApi: { list: vi.fn(), delete: vi.fn() },
  csvExportUrl: () => '/api/v1/submissions/export.csv',
}));

const emptyPage = { content: [], totalPages: 0 };

beforeEach(() => {
  submissionApi.list = vi.fn().mockResolvedValue(emptyPage);
});

const renderPage = () =>
  render(<MemoryRouter><SubmissionListPage /></MemoryRouter>);

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
