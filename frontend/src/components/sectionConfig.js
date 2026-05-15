export const SECTIONS = [
  { key: 'exercises',    label: 'Exercises',    icon: '📋', roles: ['STUDENT', 'TUTOR', 'SUPER_ADMIN'] },
  { key: 'progress',     label: 'My Progress',  icon: '📊', roles: ['STUDENT'] },
  { key: 'courses',      label: 'Courses',      icon: '📚', roles: ['TUTOR', 'SUPER_ADMIN'] },
  { key: 'categories',   label: 'Categories',   icon: '🏷️', roles: ['TUTOR', 'SUPER_ADMIN'] },
  { key: 'submissions',  label: 'Submissions',  icon: '📥', roles: ['TUTOR', 'SUPER_ADMIN'] },
  { key: 'users',        label: 'Users',        icon: '👥', roles: ['SUPER_ADMIN'] },
  { key: 'settings',     label: 'Settings',     icon: '⚙️', roles: ['SUPER_ADMIN'] },
];

export function sectionsForRole(role) {
  return SECTIONS.filter(s => s.roles.includes(role));
}

export function sidebarItems(section, role) {
  const isStudent = role === 'STUDENT';
  switch (section) {
    case 'exercises':
      return isStudent
        ? [{ label: 'All Exercises', icon: '📋', path: '/student/exercises' }]
        : [
            { label: 'All Exercises', icon: '📋', path: '/tutor/exercises' },
            { label: '+ New Exercise', icon: '➕', path: '/tutor/exercises/new' },
          ];
    case 'progress':
      return [{ label: 'Overview', icon: '📊', path: '/student/progress' }];
    case 'courses':
      return [
        { label: 'All Courses', icon: '📚', path: '/tutor/courses' },
        { label: '+ New Course', icon: '➕', path: '/tutor/courses/new' },
      ];
    case 'categories':
      return [{ label: 'Category Management', icon: '🏷️', path: '/tutor/categories' }];
    case 'submissions':
      return [
        { label: 'All Submissions', icon: '📥', path: '/tutor/submissions' },
        { label: 'Import', icon: '📤', path: '/tutor/submissions/import' },
      ];
    case 'users':
      return [{ label: 'User Management', icon: '👥', path: '/admin/users' }];
    case 'settings':
      return [{ label: 'Global Settings', icon: '⚙️', path: '/admin/settings' }];
    default:
      return [];
  }
}

export function getInitialPath(section, role) {
  const isStudent = role === 'STUDENT';
  switch (section) {
    case 'exercises':    return isStudent ? '/student/exercises' : '/tutor/exercises';
    case 'progress':     return '/student/progress';
    case 'courses':      return '/tutor/courses';
    case 'categories':   return '/tutor/categories';
    case 'submissions':  return '/tutor/submissions';
    case 'users':        return '/admin/users';
    case 'settings':     return '/admin/settings';
    default:             return '/';
  }
}

export function getDefaultSection(role) {
  if (role === 'SUPER_ADMIN') return 'users';
  return 'exercises';
}
