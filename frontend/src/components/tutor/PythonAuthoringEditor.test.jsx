import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PythonAuthoringEditor from './PythonAuthoringEditor';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }) => (
    <textarea data-testid="monaco-editor" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

vi.mock('../../api/exerciseApi');

// PythonAuthoringEditor is always rendered inside ExerciseFormPage's
// <form onSubmit={handleSubmit}>. Buttons default to type="submit" inside a
// form unless explicitly marked otherwise, so every button here must be
// type="button" or it will trigger a save as a side effect of clicking it.
function renderInForm(ui, onSubmit) {
  return render(<form onSubmit={onSubmit}>{ui}</form>);
}

describe('PythonAuthoringEditor buttons inside a form', () => {
  it('does not submit the enclosing form when "+ Add Test Case" is clicked', () => {
    const onSubmit = vi.fn(e => e.preventDefault());
    const onTestCasesChange = vi.fn();
    renderInForm(
      <PythonAuthoringEditor testCases={[]} onTestCasesChange={onTestCasesChange} />,
      onSubmit
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Add Test Case' }));

    expect(onTestCasesChange).toHaveBeenCalledWith([{ input: '', expectedOutput: '', visible: true }]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit the enclosing form when "Remove" is clicked', () => {
    const onSubmit = vi.fn(e => e.preventDefault());
    const onTestCasesChange = vi.fn();
    const testCases = [{ input: 'f(1)', expectedOutput: '1', visible: true }];
    renderInForm(
      <PythonAuthoringEditor testCases={testCases} onTestCasesChange={onTestCasesChange} />,
      onSubmit
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(onTestCasesChange).toHaveBeenCalledWith([]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit the enclosing form when "Verify Test Cases" is clicked', () => {
    const onSubmit = vi.fn(e => e.preventDefault());
    const testCases = [{ input: 'f(1)', expectedOutput: '1', visible: true }];
    renderInForm(
      <PythonAuthoringEditor testCases={testCases} onTestCasesChange={() => {}} />,
      onSubmit
    );

    fireEvent.click(screen.getByRole('button', { name: 'Verify Test Cases' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit the enclosing form when the starter code help icon is clicked', () => {
    const onSubmit = vi.fn(e => e.preventDefault());
    renderInForm(
      <PythonAuthoringEditor testCases={[]} onTestCasesChange={() => {}} />,
      onSubmit
    );

    fireEvent.click(screen.getByRole('button', { name: 'What is starter code?' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('Starter code help popover', () => {
  it('is hidden by default', () => {
    render(<PythonAuthoringEditor testCases={[]} onTestCasesChange={() => {}} />);

    expect(screen.queryByText(/initial code template/i)).not.toBeInTheDocument();
  });

  it('opens and shows an explanation with an example when the help icon is clicked', () => {
    render(<PythonAuthoringEditor testCases={[]} onTestCasesChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'What is starter code?' }));

    expect(screen.getByText(/initial code template/i)).toBeInTheDocument();
    expect(screen.getByText(/def add\(a, b\):/)).toBeInTheDocument();
  });

  it('closes when the help icon is clicked again', () => {
    render(<PythonAuthoringEditor testCases={[]} onTestCasesChange={() => {}} />);
    const helpButton = screen.getByRole('button', { name: 'What is starter code?' });

    fireEvent.click(helpButton);
    expect(screen.getByText(/initial code template/i)).toBeInTheDocument();

    fireEvent.click(helpButton);
    expect(screen.queryByText(/initial code template/i)).not.toBeInTheDocument();
  });

  it('closes when clicking outside the popover', () => {
    render(<PythonAuthoringEditor testCases={[]} onTestCasesChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'What is starter code?' }));
    expect(screen.getByText(/initial code template/i)).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText(/initial code template/i)).not.toBeInTheDocument();
  });
});
