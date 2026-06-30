import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import RubricEditor from './RubricEditor';

it('renders a description input for each existing dimension', () => {
  const dims = [{ name: 'Logic', weight: '0.6', description: 'Algorithm correctness' }];
  render(<RubricEditor dimensions={dims} onChange={() => {}} />);
  expect(screen.getByPlaceholderText('Description (optional)')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Algorithm correctness')).toBeInTheDocument();
});

it('calls onChange with updated description when description input changes', () => {
  const onChange = vi.fn();
  const dims = [{ name: 'Logic', weight: '0.6', description: '' }];
  render(<RubricEditor dimensions={dims} onChange={onChange} />);

  fireEvent.change(screen.getByPlaceholderText('Description (optional)'), {
    target: { value: 'The logic score' },
  });

  expect(onChange).toHaveBeenCalledWith([
    { name: 'Logic', weight: '0.6', description: 'The logic score' },
  ]);
});

it('new dimension added by + Add Dimension includes empty description', () => {
  const onChange = vi.fn();
  render(<RubricEditor dimensions={[]} onChange={onChange} />);

  fireEvent.click(screen.getByRole('button', { name: /\+ Add Dimension/i }));

  expect(onChange).toHaveBeenCalledWith([
    { name: '', weight: '', description: '' },
  ]);
});
