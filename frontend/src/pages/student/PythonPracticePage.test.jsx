import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PythonPracticePage from './PythonPracticePage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }) => (
    <textarea data-testid="monaco-editor" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

// Mock Worker
class MockWorker {
  constructor() {
    this.terminate = vi.fn();
    this.postMessage = vi.fn();
    this.onmessage = null;
    this.onerror = null;
  }
}
global.Worker = MockWorker;

const mockExercise = {
  id: 1,
  title: 'Test Python Exercise',
  type: 'PYTHON',
  version: {
    versionNumber: 1,
    description: 'A test exercise',
    hints: [],
    config: {
      starterCode: 'print("hello")',
      visibleTestCases: [],
      timeLimitSeconds: 5,
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PythonPracticePage', () => {
  it('renders a back button that navigates to /student/exercises', () => {
    render(<PythonPracticePage exercise={mockExercise} />);
    const backBtn = screen.getByRole('button', { name: /back to exercises/i });
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/student/exercises');
  });
});
