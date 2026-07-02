import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ExerciseFormPage from './ExerciseFormPage';
import { exerciseApi } from '../../api/exerciseApi';
import { categoryApi } from '../../api/categoryApi';

vi.mock('../../api/exerciseApi');
vi.mock('../../api/categoryApi');

// Mock heavy child components that are hard to render in unit tests
vi.mock('../../components/tutor/BlocklyAuthoringWorkspace', () => ({
  default: () => <div data-testid="blockly-authoring" />,
}));
vi.mock('../../components/tutor/PythonAuthoringEditor', () => ({
  default: () => <div data-testid="python-authoring" />,
}));
vi.mock('../../components/tutor/VersionHistoryPanel', () => ({
  default: () => <div data-testid="version-history" />,
}));
vi.mock('../../components/MarkdownEditor', () => ({
  default: ({ value, onChange }) => (
    <textarea data-testid="markdown-editor" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));
vi.mock('../../components/Breadcrumb', () => ({
  default: () => null,
}));

beforeEach(() => {
  exerciseApi.create = vi.fn().mockResolvedValue({ id: 1 });
  exerciseApi.update = vi.fn().mockResolvedValue({ id: 1 });
  exerciseApi.get = vi.fn().mockResolvedValue(null);
  exerciseApi.listVersions = vi.fn().mockResolvedValue([]);
  categoryApi.list = vi.fn().mockResolvedValue({ content: [] });
});

/**
 * Renders the create form with PYTHON type already selected.
 * The form shows a type-selection screen first; we click PYTHON to advance.
 */
const renderCreateForm = async (type = 'PYTHON') => {
  render(
    <MemoryRouter initialEntries={['/tutor/exercises/new']}>
      <Routes>
        <Route path="/tutor/exercises/new" element={<ExerciseFormPage />} />
        <Route path="/tutor/exercises" element={<div>exercises list</div>} />
      </Routes>
    </MemoryRouter>
  );

  // The form starts with a type-selection screen
  fireEvent.click(screen.getByRole('button', { name: new RegExp(type, 'i') }));

  // Wait for the form to appear (submit button)
  await waitFor(() => screen.getByRole('button', { name: /create exercise/i }));
};

const fillRequiredFields = () => {
  // Title input has no htmlFor/id, so query by its required input directly
  const inputs = screen.getAllByRole('textbox');
  const titleInput = inputs.find(el => el.required);
  if (titleInput) {
    fireEvent.change(titleInput, { target: { value: 'Test Exercise' } });
  }
  // Description is handled by MarkdownEditor mock — fill via its textarea
  fireEvent.change(screen.getByTestId('markdown-editor'), {
    target: { value: 'Some description' },
  });
};

it('includes autoGrade true in the create payload by default', async () => {
  await renderCreateForm('PYTHON');
  fillRequiredFields();

  fireEvent.click(screen.getByRole('button', { name: /create exercise/i }));

  await waitFor(() =>
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ autoGrade: true }),
      })
    )
  );
});

it('sends deadline null in the create payload when left blank', async () => {
  await renderCreateForm('PYTHON');
  fillRequiredFields();

  fireEvent.click(screen.getByRole('button', { name: /create exercise/i }));

  await waitFor(() =>
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ deadline: null })
    )
  );
});

it('sends the entered deadline in the create payload', async () => {
  await renderCreateForm('PYTHON');
  fillRequiredFields();
  fireEvent.change(screen.getByLabelText(/deadline/i), { target: { value: '2026-07-15T23:59' } });

  fireEvent.click(screen.getByRole('button', { name: /create exercise/i }));

  await waitFor(() =>
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ deadline: '2026-07-15T23:59' })
    )
  );
});

it('prefills the deadline field when editing an exercise that has one', async () => {
  exerciseApi.get = vi.fn().mockResolvedValue({
    id: 1, title: 'Existing', type: 'PYTHON', categoryId: null,
    currentVersion: { description: 'd', difficulty: 'EASY', hints: [], config: {} },
    deadline: '2026-07-15T23:59:00',
  });
  render(
    <MemoryRouter initialEntries={['/tutor/exercises/1/edit']}>
      <Routes>
        <Route path="/tutor/exercises/:id/edit" element={<ExerciseFormPage />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByLabelText(/deadline/i).value).toBe('2026-07-15T23:59'));
});

it('unchecking the toggle sends autoGrade false', async () => {
  await renderCreateForm('PYTHON');
  fillRequiredFields();

  const checkbox = screen.getByRole('checkbox', { name: /Enable automatic grading/ });
  expect(checkbox).toBeChecked();

  fireEvent.click(checkbox);
  expect(checkbox).not.toBeChecked();

  // Manual grading mode requires at least one dimension with weights summing to 1.0
  fireEvent.click(screen.getByRole('button', { name: /\+ Add Dimension/i }));
  const nameInputs = screen.getAllByPlaceholderText('Dimension name');
  fireEvent.change(nameInputs[0], { target: { value: 'Correctness' } });
  const weightInputs = screen.getAllByPlaceholderText('Weight (0–1)');
  fireEvent.change(weightInputs[0], { target: { value: '1' } });

  fireEvent.click(screen.getByRole('button', { name: /create exercise/i }));

  await waitFor(() =>
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ autoGrade: false }),
      })
    )
  );
});

it('renders the view-answer checkbox for Blockly and defaults canViewAnswer false', async () => {
  await renderCreateForm('BLOCKLY');
  fillRequiredFields();

  expect(screen.getByLabelText(/view the answer/i)).not.toBeChecked();

  fireEvent.click(screen.getByRole('button', { name: /create exercise/i }));

  await waitFor(() =>
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          canViewAnswer: false,
          answerWorkspaceXml: expect.any(String),
        }),
      })
    )
  );
});

it('checking view-answer sends canViewAnswer true', async () => {
  await renderCreateForm('BLOCKLY');
  fillRequiredFields();

  fireEvent.click(screen.getByLabelText(/view the answer/i));
  fireEvent.click(screen.getByRole('button', { name: /create exercise/i }));

  await waitFor(() =>
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ canViewAnswer: true }),
      })
    )
  );
});
