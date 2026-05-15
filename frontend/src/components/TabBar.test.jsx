import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import TabBar from './TabBar';

const tabs = [
  { id: 'a', section: 'exercises' },
  { id: 'b', section: 'courses' },
];

test('renders all tab labels', () => {
  render(<TabBar tabs={tabs} activeTabId="a" openSections={[]} onSwitch={vi.fn()} onClose={vi.fn()} onOpen={vi.fn()} />);
  expect(screen.getByText(/Exercises/i)).toBeInTheDocument();
  expect(screen.getByText(/Courses/i)).toBeInTheDocument();
});

test('active tab has aria-selected=true', () => {
  render(<TabBar tabs={tabs} activeTabId="a" openSections={[]} onSwitch={vi.fn()} onClose={vi.fn()} onOpen={vi.fn()} />);
  const exTab = screen.getByRole('tab', { name: /Exercises/i });
  expect(exTab).toHaveAttribute('aria-selected', 'true');
});

test('close button calls onClose with tab id', async () => {
  const onClose = vi.fn();
  render(<TabBar tabs={tabs} activeTabId="a" openSections={[]} onSwitch={vi.fn()} onClose={onClose} onOpen={vi.fn()} />);
  const closeBtns = screen.getAllByRole('button', { name: /close/i });
  await userEvent.click(closeBtns[0]);
  expect(onClose).toHaveBeenCalledWith('a');
});

test('add button shows available sections and calls onOpen', async () => {
  const onOpen = vi.fn();
  render(<TabBar tabs={tabs} activeTabId="a" openSections={['categories']} onSwitch={vi.fn()} onClose={vi.fn()} onOpen={onOpen} />);
  await userEvent.click(screen.getByRole('button', { name: /add tab/i }));
  await userEvent.click(screen.getByText(/Categories/i));
  expect(onOpen).toHaveBeenCalledWith('categories');
});

test('add button is hidden when no sections are available', () => {
  render(<TabBar tabs={tabs} activeTabId="a" openSections={[]} onSwitch={vi.fn()} onClose={vi.fn()} onOpen={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /add tab/i })).not.toBeInTheDocument();
});
