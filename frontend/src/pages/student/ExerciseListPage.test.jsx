import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ExerciseListPage from './ExerciseListPage';
import { studentApi } from '../../api/studentApi';
import { categoryApi } from '../../api/categoryApi';

vi.mock('../../api/studentApi', () => ({
  studentApi: { listExercises: vi.fn() },
}));

vi.mock('../../api/categoryApi', () => ({
  categoryApi: { list: vi.fn() },
}));

const emptyPage = { content: [], totalPages: 0 };

beforeEach(() => {
  studentApi.listExercises = vi.fn().mockResolvedValue(emptyPage);
  categoryApi.list = vi.fn().mockResolvedValue({ content: [] });
});

const renderPage = () =>
  render(<MemoryRouter><ExerciseListPage /></MemoryRouter>);

it('calls studentApi.listExercises once on mount', async () => {
  renderPage();
  await waitFor(() => expect(studentApi.listExercises).toHaveBeenCalledTimes(1));
});

it('does not call studentApi.listExercises when type dropdown changes without clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(studentApi.listExercises).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('combobox', { name: /type/i }), {
    target: { value: 'BLOCKLY' },
  });

  expect(studentApi.listExercises).toHaveBeenCalledTimes(1);
});

it('does not call studentApi.listExercises when difficulty dropdown changes without clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(studentApi.listExercises).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('combobox', { name: /difficulty/i }), {
    target: { value: 'EASY' },
  });

  expect(studentApi.listExercises).toHaveBeenCalledTimes(1);
});

it('calls studentApi.listExercises with selected type after clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(studentApi.listExercises).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('combobox', { name: /type/i }), {
    target: { value: 'PYTHON' },
  });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(studentApi.listExercises).toHaveBeenCalledTimes(2));
  expect(studentApi.listExercises).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'PYTHON', page: 0 })
  );
});

it('calls studentApi.listExercises with selected difficulty after clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(studentApi.listExercises).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('combobox', { name: /difficulty/i }), {
    target: { value: 'HARD' },
  });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(studentApi.listExercises).toHaveBeenCalledTimes(2));
  expect(studentApi.listExercises).toHaveBeenLastCalledWith(
    expect.objectContaining({ difficulty: 'HARD', page: 0 })
  );
});
