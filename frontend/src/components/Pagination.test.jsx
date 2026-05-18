import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import Pagination from './Pagination';

test('renders page info', () => {
  render(<Pagination page={0} totalPages={3} onPageChange={() => {}} />);
  expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
});

test('prev disabled on first page', () => {
  render(<Pagination page={0} totalPages={3} onPageChange={() => {}} />);
  expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
});

test('next disabled on last page', () => {
  render(<Pagination page={2} totalPages={3} onPageChange={() => {}} />);
  expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
});

test('calls onPageChange with prev page', () => {
  const fn = vi.fn();
  render(<Pagination page={1} totalPages={3} onPageChange={fn} />);
  fireEvent.click(screen.getByRole('button', { name: /prev/i }));
  expect(fn).toHaveBeenCalledWith(0);
});

test('calls onPageChange with next page', () => {
  const fn = vi.fn();
  render(<Pagination page={1} totalPages={3} onPageChange={fn} />);
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
  expect(fn).toHaveBeenCalledWith(2);
});

test('renders when totalPages is 1', () => {
  render(<Pagination page={0} totalPages={1} onPageChange={() => {}} />);
  expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
});

test('renders nothing when totalPages is 0', () => {
  const { container } = render(<Pagination page={0} totalPages={0} onPageChange={() => {}} />);
  expect(container.firstChild).toBeNull();
});
