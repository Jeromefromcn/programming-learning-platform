import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import Sidebar from './Sidebar';

const defaultProps = {
  menuSections: ['exercises', 'courses', 'categories'],
  activeSection: 'exercises',
  openTabSections: new Set(['exercises', 'courses']),
  collapsed: false,
  onOpen: vi.fn(),
};

test('renders all menu section labels', () => {
  render(<Sidebar {...defaultProps} />);
  expect(screen.getByText('Exercises')).toBeInTheDocument();
  expect(screen.getByText('Courses')).toBeInTheDocument();
  expect(screen.getByText('Categories')).toBeInTheDocument();
});

test('clicking a section calls onOpen with section key', async () => {
  const onOpen = vi.fn();
  render(<Sidebar {...defaultProps} onOpen={onOpen} />);
  await userEvent.click(screen.getByText('Categories'));
  expect(onOpen).toHaveBeenCalledWith('categories');
});

test('clicking active section calls onOpen (switch to existing tab)', async () => {
  const onOpen = vi.fn();
  render(<Sidebar {...defaultProps} onOpen={onOpen} />);
  await userEvent.click(screen.getByText('Exercises'));
  expect(onOpen).toHaveBeenCalledWith('exercises');
});

test('active section has aria-current=page', () => {
  render(<Sidebar {...defaultProps} />);
  const btn = screen.getByRole('button', { name: /Exercises/i });
  expect(btn).toHaveAttribute('aria-current', 'page');
});

test('non-active sections do not have aria-current', () => {
  render(<Sidebar {...defaultProps} />);
  const btn = screen.getByRole('button', { name: /Courses/i });
  expect(btn).not.toHaveAttribute('aria-current');
});

test('does not render text labels when collapsed', () => {
  render(<Sidebar {...defaultProps} collapsed={true} />);
  expect(screen.queryByText('Exercises')).not.toBeInTheDocument();
  expect(screen.queryByText('Courses')).not.toBeInTheDocument();
});

test('renders icon buttons when collapsed', () => {
  render(<Sidebar {...defaultProps} collapsed={true} />);
  expect(screen.getAllByRole('button').length).toBe(3);
});

test('unknown section key is skipped gracefully', () => {
  render(<Sidebar {...defaultProps} menuSections={['exercises', 'unknown_key']} />);
  expect(screen.getByText('Exercises')).toBeInTheDocument();
  expect(screen.queryByText('unknown_key')).not.toBeInTheDocument();
});
