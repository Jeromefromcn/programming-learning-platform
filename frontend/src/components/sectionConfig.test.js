import { describe, test, expect } from 'vitest';
import {
  sectionsForRole,
  sidebarItems,
  getInitialPath,
  SECTIONS,
} from './sectionConfig';

describe('sectionsForRole', () => {
  test('STUDENT gets exercises and progress only', () => {
    const keys = sectionsForRole('STUDENT').map(s => s.key);
    expect(keys).toEqual(['exercises', 'progress']);
  });

  test('TUTOR gets exercises, courses, categories, submissions', () => {
    const keys = sectionsForRole('TUTOR').map(s => s.key);
    expect(keys).toEqual(['exercises', 'courses', 'categories', 'submissions']);
  });

  test('SUPER_ADMIN gets all sections except progress', () => {
    const keys = sectionsForRole('SUPER_ADMIN').map(s => s.key);
    expect(keys).toEqual([
      'exercises', 'courses', 'categories', 'submissions', 'users', 'settings',
    ]);
  });
});

describe('sidebarItems', () => {
  test('exercises for STUDENT has no create link', () => {
    const items = sidebarItems('exercises', 'STUDENT');
    expect(items).toHaveLength(1);
    expect(items[0].path).toBe('/student/exercises');
  });

  test('exercises for TUTOR includes create link', () => {
    const items = sidebarItems('exercises', 'TUTOR');
    expect(items).toHaveLength(2);
    expect(items[1].path).toBe('/tutor/exercises/new');
  });

  test('courses includes All Courses and New Course', () => {
    const items = sidebarItems('courses', 'TUTOR');
    expect(items.map(i => i.path)).toEqual(['/tutor/courses', '/tutor/courses/new']);
  });

  test('submissions includes list and import', () => {
    const items = sidebarItems('submissions', 'TUTOR');
    expect(items.map(i => i.path)).toEqual([
      '/tutor/submissions', '/tutor/submissions/import',
    ]);
  });
});

describe('getInitialPath', () => {
  test('exercises for STUDENT starts at /student/exercises', () => {
    expect(getInitialPath('exercises', 'STUDENT')).toBe('/student/exercises');
  });

  test('exercises for TUTOR starts at /tutor/exercises', () => {
    expect(getInitialPath('exercises', 'TUTOR')).toBe('/tutor/exercises');
  });

  test('users starts at /admin/users', () => {
    expect(getInitialPath('users', 'SUPER_ADMIN')).toBe('/admin/users');
  });
});
