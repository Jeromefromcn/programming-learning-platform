import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import TabBar from './TabBar';

const tabs = [
  { id: 'a', section: 'exercises' },
  { id: 'b', section: 'courses' },
];

test('renders all tab labels', () => {
  render(<TabBar tabs={tabs} activeTabId="a" onSwitch={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByText(/Exercises/i)).toBeInTheDocument();
  expect(screen.getByText(/Courses/i)).toBeInTheDocument();
});

test('active tab has aria-selected=true', () => {
  render(<TabBar tabs={tabs} activeTabId="a" onSwitch={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByRole('tab', { name: /Exercises/i })).toHaveAttribute('aria-selected', 'true');
});

test('inactive tab has aria-selected=false', () => {
  render(<TabBar tabs={tabs} activeTabId="a" onSwitch={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByRole('tab', { name: /Courses/i })).toHaveAttribute('aria-selected', 'false');
});

test('close button calls onClose with tab id', async () => {
  const onClose = vi.fn();
  render(<TabBar tabs={tabs} activeTabId="a" onSwitch={vi.fn()} onClose={onClose} />);
  const closeBtns = screen.getAllByRole('button', { name: /close/i });
  await userEvent.click(closeBtns[0]);
  expect(onClose).toHaveBeenCalledWith('a');
});

test('add button is not rendered', () => {
  render(<TabBar tabs={tabs} activeTabId="a" onSwitch={vi.fn()} onClose={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /add tab/i })).not.toBeInTheDocument();
});
