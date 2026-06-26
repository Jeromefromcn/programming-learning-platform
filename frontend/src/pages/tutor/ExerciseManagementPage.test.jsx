import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ExerciseManagementPage from './ExerciseManagementPage';
import { exerciseApi } from '../../api/exerciseApi';
import { categoryApi } from '../../api/categoryApi';

vi.mock('../../api/exerciseApi');
vi.mock('../../api/categoryApi');

const emptyPage = { content: [], totalPages: 0 };

beforeEach(() => {
  exerciseApi.list = vi.fn().mockResolvedValue(emptyPage);
  categoryApi.list = vi.fn().mockResolvedValue({ content: [] });
});

const renderPage = () =>
  render(<MemoryRouter><ExerciseManagementPage /></MemoryRouter>);

it('does not call exerciseApi.list again when title input changes without clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByPlaceholderText(/search title/i), {
    target: { value: 'loops' },
  });

  expect(exerciseApi.list).toHaveBeenCalledTimes(1);
});

it('calls exerciseApi.list with title after clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByPlaceholderText(/search title/i), {
    target: { value: 'loops' },
  });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(2));
  expect(exerciseApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'loops', page: 0 }));
});

it('calls exerciseApi.list after pressing Enter in title input', async () => {
  renderPage();
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  const input = screen.getByPlaceholderText(/search title/i);
  fireEvent.change(input, { target: { value: 'variables' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(2));
  expect(exerciseApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'variables' }));
});

it('does not call exerciseApi.list when type dropdown changes without clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByDisplayValue('All Types'), {
    target: { value: 'PYTHON' },
  });

  expect(exerciseApi.list).toHaveBeenCalledTimes(1);
});
