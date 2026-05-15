import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import SectionRouter from './SectionRouter';

// Mock all page components to avoid their API calls
vi.mock('../pages/student/ExerciseListPage', () => ({
  default: () => <div data-testid="page">ExerciseListPage</div>,
}));
vi.mock('../pages/student/ExercisePracticeRouter', () => ({
  default: () => <div data-testid="page">ExercisePracticeRouter</div>,
}));
vi.mock('../pages/student/ProgressPage', () => ({
  default: () => <div data-testid="page">ProgressPage</div>,
}));
vi.mock('../pages/tutor/ExerciseManagementPage', () => ({
  default: () => <div data-testid="page">ExerciseManagementPage</div>,
}));
vi.mock('../pages/tutor/ExerciseFormPage', () => ({
  default: () => <div data-testid="page">ExerciseFormPage</div>,
}));
vi.mock('../pages/tutor/CourseManagementPage', () => ({
  default: () => <div data-testid="page">CourseManagementPage</div>,
}));
vi.mock('../pages/tutor/CourseFormPage', () => ({
  default: () => <div data-testid="page">CourseFormPage</div>,
}));
vi.mock('../pages/tutor/CourseDetailPage', () => ({
  default: () => <div data-testid="page">CourseDetailPage</div>,
}));
vi.mock('../pages/tutor/CategoryManagementPage', () => ({
  default: () => <div data-testid="page">CategoryManagementPage</div>,
}));
vi.mock('../pages/tutor/SubmissionListPage', () => ({
  default: () => <div data-testid="page">SubmissionListPage</div>,
}));
vi.mock('../pages/tutor/SubmissionImportPage', () => ({
  default: () => <div data-testid="page">SubmissionImportPage</div>,
}));
vi.mock('../pages/tutor/SubmissionDetailPage', () => ({
  default: () => <div data-testid="page">SubmissionDetailPage</div>,
}));
vi.mock('../pages/admin/UserManagementPage', () => ({
  default: () => <div data-testid="page">UserManagementPage</div>,
}));
vi.mock('../pages/admin/GlobalSettingsPage', () => ({
  default: () => <div data-testid="page">GlobalSettingsPage</div>,
}));

function wrap(section, role, initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SectionRouter section={section} role={role} />
    </MemoryRouter>
  );
}

test('exercises + STUDENT renders ExerciseListPage', () => {
  wrap('exercises', 'STUDENT', '/student/exercises');
  expect(screen.getByTestId('page')).toHaveTextContent('ExerciseListPage');
});

test('exercises + TUTOR renders ExerciseManagementPage', () => {
  wrap('exercises', 'TUTOR', '/tutor/exercises');
  expect(screen.getByTestId('page')).toHaveTextContent('ExerciseManagementPage');
});

test('exercises/new + TUTOR renders ExerciseFormPage', () => {
  wrap('exercises', 'TUTOR', '/tutor/exercises/new');
  expect(screen.getByTestId('page')).toHaveTextContent('ExerciseFormPage');
});

test('exercises/:id/practice + STUDENT renders ExercisePracticeRouter', () => {
  wrap('exercises', 'STUDENT', '/student/exercises/42/practice');
  expect(screen.getByTestId('page')).toHaveTextContent('ExercisePracticeRouter');
});

test('exercises/:id/edit + TUTOR renders ExerciseFormPage', () => {
  wrap('exercises', 'TUTOR', '/tutor/exercises/42/edit');
  expect(screen.getByTestId('page')).toHaveTextContent('ExerciseFormPage');
});

test('progress + STUDENT renders ProgressPage', () => {
  wrap('progress', 'STUDENT', '/student/progress');
  expect(screen.getByTestId('page')).toHaveTextContent('ProgressPage');
});

test('courses + TUTOR renders CourseManagementPage', () => {
  wrap('courses', 'TUTOR', '/tutor/courses');
  expect(screen.getByTestId('page')).toHaveTextContent('CourseManagementPage');
});

test('courses/new + TUTOR renders CourseFormPage', () => {
  wrap('courses', 'TUTOR', '/tutor/courses/new');
  expect(screen.getByTestId('page')).toHaveTextContent('CourseFormPage');
});

test('courses/:id/edit + TUTOR renders CourseFormPage', () => {
  wrap('courses', 'TUTOR', '/tutor/courses/42/edit');
  expect(screen.getByTestId('page')).toHaveTextContent('CourseFormPage');
});

test('courses/:id + TUTOR renders CourseDetailPage', () => {
  wrap('courses', 'TUTOR', '/tutor/courses/42');
  expect(screen.getByTestId('page')).toHaveTextContent('CourseDetailPage');
});

test('categories + TUTOR renders CategoryManagementPage', () => {
  wrap('categories', 'TUTOR', '/tutor/categories');
  expect(screen.getByTestId('page')).toHaveTextContent('CategoryManagementPage');
});

test('submissions + TUTOR renders SubmissionListPage', () => {
  wrap('submissions', 'TUTOR', '/tutor/submissions');
  expect(screen.getByTestId('page')).toHaveTextContent('SubmissionListPage');
});

test('submissions/import + TUTOR renders SubmissionImportPage', () => {
  wrap('submissions', 'TUTOR', '/tutor/submissions/import');
  expect(screen.getByTestId('page')).toHaveTextContent('SubmissionImportPage');
});

test('submissions/:id + TUTOR renders SubmissionDetailPage', () => {
  wrap('submissions', 'TUTOR', '/tutor/submissions/42');
  expect(screen.getByTestId('page')).toHaveTextContent('SubmissionDetailPage');
});

test('users + SUPER_ADMIN renders UserManagementPage', () => {
  wrap('users', 'SUPER_ADMIN', '/admin/users');
  expect(screen.getByTestId('page')).toHaveTextContent('UserManagementPage');
});

test('settings + SUPER_ADMIN renders GlobalSettingsPage', () => {
  wrap('settings', 'SUPER_ADMIN', '/admin/settings');
  expect(screen.getByTestId('page')).toHaveTextContent('GlobalSettingsPage');
});
