import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PythonAuthoringEditor from './PythonAuthoringEditor';
import { exerciseApi } from '../../api/exerciseApi';

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

describe('Test cases help popover', () => {
  it('is hidden by default', () => {
    render(<PythonAuthoringEditor testCases={[]} onTestCasesChange={() => {}} />);

    expect(screen.queryByText(/must print/i)).not.toBeInTheDocument();
  });

  it('does not submit the enclosing form when clicked', () => {
    const onSubmit = vi.fn(e => e.preventDefault());
    renderInForm(
      <PythonAuthoringEditor testCases={[]} onTestCasesChange={() => {}} />,
      onSubmit
    );

    fireEvent.click(screen.getByRole('button', { name: 'How do test cases work?' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('explains Input expression, Expected output, Add Test Case, and Verify Test Cases', () => {
    render(<PythonAuthoringEditor testCases={[]} onTestCasesChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'How do test cases work?' }));

    expect(screen.getByText(/must print/i)).toBeInTheDocument();
    expect(screen.getByText(/print\(fizzbuzz\(3\)\)/)).toBeInTheDocument();
    expect(screen.getByText(/exact text/i)).toBeInTheDocument();
    expect(screen.getByText(/adds a new blank/i)).toBeInTheDocument();
    expect(screen.getByText(/runs every test case/i)).toBeInTheDocument();
  });

  it('closes when clicking outside the popover', () => {
    render(<PythonAuthoringEditor testCases={[]} onTestCasesChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'How do test cases work?' }));
    expect(screen.getByText(/must print/i)).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText(/must print/i)).not.toBeInTheDocument();
  });
});

describe('Reference solution editor', () => {
  it('renders with the given value and reports edits via onReferenceSolutionChange', () => {
    const onReferenceSolutionChange = vi.fn();
    render(
      <PythonAuthoringEditor
        testCases={[]}
        onTestCasesChange={() => {}}
        referenceSolution={'def add(a, b):\n    return a + b'}
        onReferenceSolutionChange={onReferenceSolutionChange}
      />
    );

    const editors = screen.getAllByTestId('monaco-editor');
    expect(editors[1]).toHaveValue('def add(a, b):\n    return a + b');

    fireEvent.change(editors[1], { target: { value: 'def add(a, b):\n    return a - b' } });

    expect(onReferenceSolutionChange).toHaveBeenCalledWith('def add(a, b):\n    return a - b');
  });

  it('does not submit the enclosing form when its help icon is clicked', () => {
    const onSubmit = vi.fn(e => e.preventDefault());
    renderInForm(
      <PythonAuthoringEditor testCases={[]} onTestCasesChange={() => {}} />,
      onSubmit
    );

    fireEvent.click(screen.getByRole('button', { name: 'What is a reference solution?' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('explains that it is used to verify test cases and is never shown to students', () => {
    render(<PythonAuthoringEditor testCases={[]} onTestCasesChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'What is a reference solution?' }));

    expect(screen.getByText(/never shown to students/i)).toBeInTheDocument();
    expect(screen.getByText(/runs your test cases against this code/i)).toBeInTheDocument();
  });
});

describe('Verify Test Cases uses the reference solution', () => {
  it('sends referenceSolution (not starterCode) to exerciseApi.verify', async () => {
    exerciseApi.verify = vi.fn().mockResolvedValue({ results: [] });
    const testCases = [{ input: 'print(add(2, 3))', expectedOutput: '5', visible: true }];
    render(
      <PythonAuthoringEditor
        starterCode={'def add(a, b):\n    pass'}
        referenceSolution={'def add(a, b):\n    return a + b'}
        timeLimitSeconds={5}
        testCases={testCases}
        onTestCasesChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Verify Test Cases' }));

    await vi.waitFor(() => expect(exerciseApi.verify).toHaveBeenCalled());
    expect(exerciseApi.verify).toHaveBeenCalledWith({
      referenceSolution: 'def add(a, b):\n    return a + b',
      timeLimitSeconds: 5,
      testCases: [{ input: 'print(add(2, 3))', expectedOutput: '5' }],
    });
  });

  it('shows an alert and does not call the API when the reference solution is blank', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    exerciseApi.verify = vi.fn();
    const testCases = [{ input: 'print(add(2, 3))', expectedOutput: '5', visible: true }];
    render(
      <PythonAuthoringEditor
        referenceSolution=""
        testCases={testCases}
        onTestCasesChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Verify Test Cases' }));

    expect(alertSpy).toHaveBeenCalledWith('Add a reference solution before verifying.');
    expect(exerciseApi.verify).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe('Test case field placeholders', () => {
  it('shows a print()-based example for Input expression, matching how the sandbox evaluates it', () => {
    const testCases = [{ input: '', expectedOutput: '', visible: true }];
    render(<PythonAuthoringEditor testCases={testCases} onTestCasesChange={() => {}} />);

    expect(screen.getByPlaceholderText('e.g. print(fizzbuzz(3))')).toBeInTheDocument();
  });

  it('shows an unquoted example for Expected output, matching raw stdout comparison', () => {
    const testCases = [{ input: '', expectedOutput: '', visible: true }];
    render(<PythonAuthoringEditor testCases={testCases} onTestCasesChange={() => {}} />);

    expect(screen.getByPlaceholderText('e.g. Fizz')).toBeInTheDocument();
  });
});
