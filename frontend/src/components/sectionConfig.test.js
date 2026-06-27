import { describe, test, expect } from 'vitest';
import {
  sectionsForRole,
  getInitialPath,
  SECTIONS,
} from './sectionConfig';

describe('SECTIONS', () => {
  test('contains all 8 expected section keys', () => {
    const keys = SECTIONS.map(s => s.key);
    expect(keys).toEqual([
      'exercises', 'progress', 'courses', 'categories', 'submissions', 'users', 'settings', 'data',
    ]);
  });
});

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
      'exercises', 'courses', 'categories', 'submissions', 'users', 'settings', 'data',
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

  test('data starts at /admin/data', () => {
    expect(getInitialPath('data', 'SUPER_ADMIN')).toBe('/admin/data');
  });

  test('unknown section returns /', () => {
    expect(getInitialPath('nonexistent', 'TUTOR')).toBe('/');
  });
});
