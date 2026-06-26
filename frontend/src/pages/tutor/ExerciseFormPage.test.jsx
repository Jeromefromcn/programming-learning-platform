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

it('includes showResult true in the create payload by default', async () => {
  await renderCreateForm('PYTHON');
  fillRequiredFields();

  fireEvent.click(screen.getByRole('button', { name: /create exercise/i }));

  await waitFor(() =>
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ showResult: true }),
      })
    )
  );
});

it('unchecking the toggle sends showResult false', async () => {
  await renderCreateForm('PYTHON');
  fillRequiredFields();

  const checkbox = screen.getByRole('checkbox', { name: /Show instant result feedback/ });
  expect(checkbox).toBeChecked();

  fireEvent.click(checkbox);
  expect(checkbox).not.toBeChecked();

  fireEvent.click(screen.getByRole('button', { name: /create exercise/i }));

  await waitFor(() =>
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ showResult: false }),
      })
    )
  );
});
