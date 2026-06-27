import { Routes, Route } from 'react-router-dom';
import ExerciseListPage from '../pages/student/ExerciseListPage';
import ExercisePracticeRouter from '../pages/student/ExercisePracticeRouter';
import ProgressPage from '../pages/student/ProgressPage';
import ExerciseManagementPage from '../pages/tutor/ExerciseManagementPage';
import ExerciseFormPage from '../pages/tutor/ExerciseFormPage';
import CourseManagementPage from '../pages/tutor/CourseManagementPage';
import CourseFormPage from '../pages/tutor/CourseFormPage';
import CourseDetailPage from '../pages/tutor/CourseDetailPage';
import CategoryManagementPage from '../pages/tutor/CategoryManagementPage';
import SubmissionListPage from '../pages/tutor/SubmissionListPage';
import SubmissionImportPage from '../pages/tutor/SubmissionImportPage';
import SubmissionDetailPage from '../pages/tutor/SubmissionDetailPage';
import UserManagementPage from '../pages/admin/UserManagementPage';
import GlobalSettingsPage from '../pages/admin/GlobalSettingsPage';
import DataManagementPage from '../pages/admin/DataManagementPage';

export default function SectionRouter({ section, role }) {
  const isStudent = role === 'STUDENT';

  return (
    <Routes>
      {section === 'exercises' && isStudent && (
        <>
          <Route path="/student/exercises" element={<ExerciseListPage />} />
          <Route path="/student/exercises/:id/practice" element={<ExercisePracticeRouter />} />
        </>
      )}
      {section === 'exercises' && !isStudent && (
        <>
          <Route path="/tutor/exercises" element={<ExerciseManagementPage />} />
          <Route path="/tutor/exercises/new" element={<ExerciseFormPage />} />
          <Route path="/tutor/exercises/:id/edit" element={<ExerciseFormPage />} />
        </>
      )}
      {section === 'progress' && (
        <Route path="/student/progress" element={<ProgressPage />} />
      )}
      {section === 'courses' && (
        <>
          <Route path="/tutor/courses" element={<CourseManagementPage />} />
          <Route path="/tutor/courses/new" element={<CourseFormPage />} />
          <Route path="/tutor/courses/:id/edit" element={<CourseFormPage />} />
          <Route path="/tutor/courses/:id" element={<CourseDetailPage />} />
        </>
      )}
      {section === 'categories' && (
        <Route path="/tutor/categories" element={<CategoryManagementPage />} />
      )}
      {section === 'submissions' && (
        <>
          <Route path="/tutor/submissions" element={<SubmissionListPage />} />
          <Route path="/tutor/submissions/import" element={<SubmissionImportPage />} />
          <Route path="/tutor/submissions/:id" element={<SubmissionDetailPage />} />
        </>
      )}
      {section === 'users' && (
        <Route path="/admin/users" element={<UserManagementPage />} />
      )}
      {section === 'settings' && (
        <Route path="/admin/settings" element={<GlobalSettingsPage />} />
      )}
      {section === 'data' && (
        <Route path="/admin/data" element={<DataManagementPage />} />
      )}
    </Routes>
  );
}
