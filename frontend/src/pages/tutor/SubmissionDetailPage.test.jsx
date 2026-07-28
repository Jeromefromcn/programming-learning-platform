import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, it, expect, describe } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import SubmissionDetailPage from './SubmissionDetailPage';
import { submissionApi } from '../../api/submissionApi';
import { exerciseApi } from '../../api/exerciseApi';
import Breadcrumb from '../../components/Breadcrumb';

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
  default: vi.fn(() => null),
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

it('passes backTo as the Submissions breadcrumb link when present', async () => {
  submissionApi.getById.mockResolvedValue(baseSubmission);
  exerciseApi.get.mockResolvedValue({ currentVersion: { config: {} } });

  render(
    <MemoryRouter initialEntries={[{ pathname: '/tutor/submissions/1', state: { backTo: '/tutor/submissions?source=STUDENT' } }]}>
      <Routes>
        <Route path="/tutor/submissions/:id" element={<SubmissionDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => expect(Breadcrumb).toHaveBeenCalled());
  const lastProps = Breadcrumb.mock.calls.at(-1)[0];
  expect(lastProps.items).toContainEqual({ label: 'Submissions', to: '/tutor/submissions?source=STUDENT' });
});

it('navigates to backTo when Back to Submissions is clicked', async () => {
  submissionApi.getById.mockResolvedValue(baseSubmission);
  exerciseApi.get.mockResolvedValue({ currentVersion: { config: {} } });

  function ListPageStub() {
    return <div>List Page {useLocation().search}</div>;
  }

  render(
    <MemoryRouter initialEntries={[{ pathname: '/tutor/submissions/1', state: { backTo: '/tutor/submissions?source=STUDENT' } }]}>
      <Routes>
        <Route path="/tutor/submissions/:id" element={<SubmissionDetailPage />} />
        <Route path="/tutor/submissions" element={<ListPageStub />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText('Test Exercise'));
  fireEvent.click(screen.getByText(/back to submissions/i));

  await waitFor(() => screen.getByText('List Page ?source=STUDENT'));
});

it('falls back to /tutor/submissions when no backTo state is present', async () => {
  submissionApi.getById.mockResolvedValue(baseSubmission);
  exerciseApi.get.mockResolvedValue({ currentVersion: { config: {} } });

  render(
    <MemoryRouter initialEntries={['/tutor/submissions/1']}>
      <Routes>
        <Route path="/tutor/submissions/:id" element={<SubmissionDetailPage />} />
        <Route path="/tutor/submissions" element={<div>List Page</div>} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText('Test Exercise'));
  fireEvent.click(screen.getByText(/back to submissions/i));

  await waitFor(() => screen.getByText('List Page'));
});

it('navigates to backTo after a successful save', async () => {
  submissionApi.getById.mockResolvedValue(baseSubmission);
  exerciseApi.get.mockResolvedValue({ currentVersion: { config: {} } });
  submissionApi.grade.mockResolvedValue({ ...baseSubmission, tutorScore: 90, graded: true });

  render(
    <MemoryRouter initialEntries={[{ pathname: '/tutor/submissions/1', state: { backTo: '/tutor/submissions?graded=false' } }]}>
      <Routes>
        <Route path="/tutor/submissions/:id" element={<SubmissionDetailPage />} />
        <Route path="/tutor/submissions" element={<div>List Page</div>} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText('Test Exercise'));
  fireEvent.change(screen.getByLabelText(/score/i), { target: { value: '90' } });
  fireEvent.click(screen.getByRole('button', { name: /save grade/i }));

  await waitFor(() => screen.getByText('List Page'));
  expect(submissionApi.grade).toHaveBeenCalledWith('1', { tutorScore: 90, tutorComment: null });
});

it('stays on the page and shows an error when save fails', async () => {
  submissionApi.getById.mockResolvedValue(baseSubmission);
  exerciseApi.get.mockResolvedValue({ currentVersion: { config: {} } });
  submissionApi.grade.mockRejectedValue({ response: { data: { error: { message: 'Save failed.' } } } });

  render(
    <MemoryRouter initialEntries={[{ pathname: '/tutor/submissions/1', state: { backTo: '/tutor/submissions?graded=false' } }]}>
      <Routes>
        <Route path="/tutor/submissions/:id" element={<SubmissionDetailPage />} />
        <Route path="/tutor/submissions" element={<div>List Page</div>} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText('Test Exercise'));
  fireEvent.change(screen.getByLabelText(/score/i), { target: { value: '90' } });
  fireEvent.click(screen.getByRole('button', { name: /save grade/i }));

  await waitFor(() => screen.getByText('Save failed.'));
  expect(screen.queryByText('List Page')).not.toBeInTheDocument();
});
