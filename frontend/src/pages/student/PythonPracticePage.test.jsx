import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PythonPracticePage from './PythonPracticePage';
import { studentApi } from '../../api/studentApi';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'STUDENT' } }),
  AuthProvider: ({ children }) => children,
}));

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

vi.mock('../../api/studentApi');

// Mock Worker
class MockWorker {
  constructor() {
    this.terminate = vi.fn();
    this.postMessage = vi.fn();
    this.onmessage = null;
    this.onerror = null;
    MockWorker.instances.push(this);
  }
}
MockWorker.instances = [];
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
  // Default: no draft exists, so getDraft resolves null for all tests
  studentApi.getDraft.mockResolvedValue(null);
});

describe('PythonPracticePage', () => {
  it('renders a back button that navigates to /student/exercises', () => {
    render(<MemoryRouter><PythonPracticePage exercise={mockExercise} /></MemoryRouter>);
    const backBtn = screen.getByRole('button', { name: /back to exercises/i });
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/student/exercises');
  });
});

const exercise = {
  id: 5, title: 'FizzBuzz', type: 'PYTHON',
  version: { versionNumber: 1, description: 'd', hints: [],
    config: { starterCode: 'x=1', visibleTestCases: [], showResult: true } },
};

describe('PythonPracticePage submit/draft', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads draft on mount and shows Submit/Save buttons', async () => {
    studentApi.getDraft.mockResolvedValue({ answerData: 'print(99)' });
    render(<MemoryRouter><PythonPracticePage exercise={exercise} /></MemoryRouter>);
    await waitFor(() => expect(studentApi.getDraft).toHaveBeenCalledWith(5));
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });

  it('submit shows result modal when showResult true', async () => {
    studentApi.getDraft.mockResolvedValue(null);
    studentApi.submit.mockResolvedValue({ submissionId: 1, showResult: true, score: 100, passed: true });
    render(<MemoryRouter><PythonPracticePage exercise={exercise} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(studentApi.submit).toHaveBeenCalledWith(5, expect.objectContaining({ answerData: expect.any(String) })));
    expect(await screen.findByText(/100/)).toBeInTheDocument();
  });

  it('shows an error message when submit is rejected (e.g. already graded)', async () => {
    studentApi.getDraft.mockResolvedValue(null);
    studentApi.submit.mockRejectedValue({
      response: { data: { error: { message: 'This exercise has already been graded and cannot be resubmitted.' } } },
    });
    render(<MemoryRouter><PythonPracticePage exercise={exercise} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findByText(/already been graded and cannot be resubmitted/i)).toBeInTheDocument();
  });
});

describe('PythonPracticePage Pyodide bootstrap vs. run timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockWorker.instances = [];
    studentApi.getDraft.mockResolvedValue(null);
  });

  it('disables Run until the worker reports the Python environment is ready', () => {
    render(<MemoryRouter><PythonPracticePage exercise={mockExercise} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /run/i })).toBeDisabled();
  });

  it('enables Run once the worker posts a ready message', () => {
    render(<MemoryRouter><PythonPracticePage exercise={mockExercise} /></MemoryRouter>);
    const worker = MockWorker.instances[0];

    act(() => {
      worker.onmessage({ data: { type: 'ready' } });
    });

    expect(screen.getByRole('button', { name: /run/i })).not.toBeDisabled();
  });

  it('shows a visible loading message while the Python environment is not ready', () => {
    render(<MemoryRouter><PythonPracticePage exercise={mockExercise} /></MemoryRouter>);
    expect(screen.getByText(/loading python/i)).toBeInTheDocument();
  });

  it('hides the loading message once the worker posts a ready message', () => {
    render(<MemoryRouter><PythonPracticePage exercise={mockExercise} /></MemoryRouter>);
    const worker = MockWorker.instances[0];

    act(() => {
      worker.onmessage({ data: { type: 'ready' } });
    });

    expect(screen.queryByText(/loading python/i)).not.toBeInTheDocument();
  });
});

describe('PythonPracticePage deadline', () => {
  it('disables Submit and shows a message when the deadline has passed', async () => {
    studentApi.getDraft.mockResolvedValue(null);
    const pastDeadlineExercise = { ...exercise, deadline: '2020-01-01T00:00:00' };
    render(<MemoryRouter><PythonPracticePage exercise={pastDeadlineExercise} /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
    expect(screen.getByText(/deadline for this exercise has passed/i)).toBeInTheDocument();
  });

  it('keeps Submit enabled when there is no deadline', async () => {
    studentApi.getDraft.mockResolvedValue(null);
    render(<MemoryRouter><PythonPracticePage exercise={exercise} /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled();
  });
});
