import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import MarkdownEditor from './MarkdownEditor';

describe('MarkdownEditor', () => {
  it('renders textarea with the given value', () => {
    render(<MarkdownEditor value="# Hello" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('# Hello');
  });

  it('renders the Markdown preview panel', () => {
    render(<MarkdownEditor value="# Hello" onChange={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello');
  });

  it('shows placeholder text when value is empty', () => {
    render(<MarkdownEditor value="" onChange={() => {}} />);
    expect(screen.getByText('Nothing to preview')).toBeTruthy();
  });

  it('calls onChange with updated value when textarea changes', async () => {
    const onChange = vi.fn();
    render(<MarkdownEditor value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), 'x');
    expect(onChange).toHaveBeenCalledWith('x');
  });
});
