import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import DataManagementPage from './DataManagementPage';
import { submissionApi } from '../../api/submissionApi';
import { exerciseApi } from '../../api/exerciseApi';

vi.mock('../../api/submissionApi');
vi.mock('../../api/exerciseApi');
vi.mock('../../api/axiosInstance', () => ({ default: {}, isReauthCancelled: () => false }));

beforeEach(() => {
  exerciseApi.list = vi.fn().mockResolvedValue({ content: [{ id: 1, title: 'Math Exercise' }] });
  submissionApi.previewPurge = vi.fn().mockResolvedValue({ count: 5 });
  submissionApi.purge = vi.fn().mockResolvedValue({ deletedCount: 5 });
  global.confirm = vi.fn(() => true);
});

test('renders page title and filter form', async () => {
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Data Management')).toBeInTheDocument();
  expect(screen.getByLabelText(/before date/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument();
});

test('purge buttons are disabled before preview', async () => {
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: /soft delete/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /hard delete/i })).toBeDisabled();
});

test('preview button is disabled when before date is empty', async () => {
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: /preview/i })).toBeDisabled();
});

test('clicking preview fetches count and enables purge buttons', async () => {
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/before date/i), { target: { value: '2025-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: /preview/i }));

  await waitFor(() => expect(submissionApi.previewPurge).toHaveBeenCalledWith({
    before: '2025-01-01',
    exerciseId: undefined,
    source: undefined,
  }));

  expect(await screen.findByText(/5 submissions match/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /soft delete/i })).not.toBeDisabled();
  expect(screen.getByRole('button', { name: /hard delete/i })).not.toBeDisabled();
});

test('changing filter after preview disables purge buttons again', async () => {
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/before date/i), { target: { value: '2025-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: /preview/i }));
  await screen.findByText(/5 submissions match/i);

  fireEvent.change(screen.getByLabelText(/before date/i), { target: { value: '2024-01-01' } });

  expect(screen.queryByText(/5 submissions match/i)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /soft delete/i })).toBeDisabled();
});

test('soft delete calls purge with SOFT mode and shows toast', async () => {
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/before date/i), { target: { value: '2025-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: /preview/i }));
  await screen.findByText(/5 submissions match/i);

  fireEvent.click(screen.getByRole('button', { name: /soft delete/i }));

  await waitFor(() => expect(submissionApi.purge).toHaveBeenCalledWith({
    before: '2025-01-01',
    exerciseId: undefined,
    source: undefined,
    mode: 'SOFT',
  }));
  expect(await screen.findByText(/5 submissions soft-deleted/i)).toBeInTheDocument();
});

test('hard delete calls purge with HARD mode and shows toast', async () => {
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/before date/i), { target: { value: '2025-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: /preview/i }));
  await screen.findByText(/5 submissions match/i);

  fireEvent.click(screen.getByRole('button', { name: /hard delete/i }));

  await waitFor(() => expect(submissionApi.purge).toHaveBeenCalledWith({
    before: '2025-01-01',
    exerciseId: undefined,
    source: undefined,
    mode: 'HARD',
  }));
  expect(await screen.findByText(/5 submissions permanently deleted/i)).toBeInTheDocument();
});

test('cancelled confirm does not call purge', async () => {
  global.confirm = vi.fn(() => false);
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/before date/i), { target: { value: '2025-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: /preview/i }));
  await screen.findByText(/5 submissions match/i);

  fireEvent.click(screen.getByRole('button', { name: /soft delete/i }));
  expect(submissionApi.purge).not.toHaveBeenCalled();
});
