export const SECTIONS = [
  { key: 'exercises',   label: 'Exercises',   icon: '📋', roles: ['STUDENT', 'TUTOR', 'SUPER_ADMIN'] },
  { key: 'progress',    label: 'My Progress', icon: '📊', roles: ['STUDENT'] },
  { key: 'courses',     label: 'Courses',     icon: '📚', roles: ['TUTOR', 'SUPER_ADMIN'] },
  { key: 'categories',  label: 'Categories',  icon: '🏷️', roles: ['TUTOR', 'SUPER_ADMIN'] },
  { key: 'submissions', label: 'Submissions', icon: '📥', roles: ['TUTOR', 'SUPER_ADMIN'] },
  { key: 'users',       label: 'Users',       icon: '👥', roles: ['SUPER_ADMIN'] },
  { key: 'settings',    label: 'Settings',    icon: '⚙️', roles: ['SUPER_ADMIN'] },
];

export function sectionsForRole(role) {
  return SECTIONS.filter(s => s.roles.includes(role));
}

export function getInitialPath(section, role) {
  const isStudent = role === 'STUDENT';
  switch (section) {
    case 'exercises':   return isStudent ? '/student/exercises' : '/tutor/exercises';
    case 'progress':    return '/student/progress';
    case 'courses':     return '/tutor/courses';
    case 'categories':  return '/tutor/categories';
    case 'submissions': return '/tutor/submissions';
    case 'users':       return '/admin/users';
    case 'settings':    return '/admin/settings';
    default:            return '/';
  }
}
