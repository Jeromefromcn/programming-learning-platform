import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SubmissionDetailPage from './SubmissionDetailPage';
import { submissionApi } from '../../api/submissionApi';
import { exerciseApi } from '../../api/exerciseApi';

vi.mock('../../api/submissionApi', () => ({
  submissionApi: { getById: vi.fn(), grade: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../api/exerciseApi', () => ({
  exerciseApi: { get: vi.fn() },
}));
vi.mock('../../components/BlocklySubmissionViewer', () => ({
  default: () => <div data-testid="blockly-viewer" />,
}));
vi.mock('../../components/Breadcrumb', () => ({
  default: () => null,
}));
vi.mock('../../api/axiosInstance', () => ({
  isReauthCancelled: () => false,
}));

const baseSubmission = {
  id: 1,
  exerciseId: 42,
  exerciseType: 'BLOCKLY',
  exerciseTitle: 'Test Exercise',
  studentName: 'alice',
  workspaceXml: '<xml/>',
  graded: false,
  versionMismatch: false,
  tutorScore: null,
  autoScore: null,
  tutorComment: null,
  tutorGradeDetails: null,
  autoGradeDetails: null,
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/tutor/submissions/1']}>
      <Routes>
        <Route path="/tutor/submissions/:id" element={<SubmissionDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

it('shows dimension description below the dimension label in the grading panel', async () => {
  submissionApi.getById.mockResolvedValue(baseSubmission);
  exerciseApi.get.mockResolvedValue({
    currentVersion: {
      config: {
        autoGrade: false,
        rubric: {
          dimensions: [
            { name: 'Logic', weight: 0.6, description: 'Correctness of the algorithm' },
          ],
        },
      },
    },
  });

  renderPage();

  await waitFor(() => screen.getByText('Correctness of the algorithm'));
  expect(screen.getByText('Correctness of the algorithm')).toBeInTheDocument();
});

it('does not render description text when description is absent', async () => {
  submissionApi.getById.mockResolvedValue(baseSubmission);
  exerciseApi.get.mockResolvedValue({
    currentVersion: {
      config: {
        autoGrade: false,
        rubric: {
          dimensions: [{ name: 'Logic', weight: 0.6 }],
        },
      },
    },
  });

  renderPage();

  await waitFor(() => screen.getByText(/Logic/));
  expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  expect(screen.queryByText('null')).not.toBeInTheDocument();
});
