import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MarkdownRenderer from './MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('renders h1 from # heading', () => {
    render(<MarkdownRenderer content="# Hello" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello');
  });

  it('renders strong from **bold**', () => {
    const { container } = render(<MarkdownRenderer content="**bold**" />);
    expect(container.querySelector('strong')).toHaveTextContent('bold');
  });

  it('renders code element from backtick inline code', () => {
    const { container } = render(<MarkdownRenderer content="`print()`" />);
    expect(container.querySelector('code')).toHaveTextContent('print()');
  });

  it('renders li from - list item', () => {
    const { container } = render(<MarkdownRenderer content="- item one" />);
    expect(container.querySelector('li')).toHaveTextContent('item one');
  });

  it('does not render a script element from raw HTML', () => {
    const { container } = render(<MarkdownRenderer content="<script>alert(1)</script>" />);
    expect(container.querySelector('script')).toBeNull();
  });

  it('renders empty content without crashing', () => {
    const { container } = render(<MarkdownRenderer content="" />);
    expect(container).toBeTruthy();
  });

  it('renders fenced code block inside pre without inline-code background', () => {
    const { container } = render(<MarkdownRenderer content={'```python\nprint("hi")\n```'} />);
    const pre = container.querySelector('pre');
    const code = container.querySelector('pre code');
    expect(pre).toBeTruthy();
    expect(code).toBeTruthy();
    expect(code.style.background).toBe('');
  });
});
