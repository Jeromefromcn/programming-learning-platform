import { vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import BlocklyPracticePage from './BlocklyPracticePage';

// Blockly cannot run in jsdom — mock it entirely
vi.mock('blockly', () => {
  const mockWorkspace = { addChangeListener: vi.fn(), dispose: vi.fn() };
  const mockBlockly = {
    inject: vi.fn(() => mockWorkspace),
    Xml: {
      workspaceToDom: vi.fn(() => ({})),
      domToText: vi.fn(() => '<xml></xml>'),
      domToWorkspace: vi.fn(),
    },
    utils: { xml: { textToDom: vi.fn(() => ({})) } },
  };
  return { default: mockBlockly, ...mockBlockly };
});
vi.mock('blockly/blocks', () => ({}));
vi.mock('blockly/javascript', () => ({
  javascriptGenerator: { workspaceToCode: vi.fn(() => '') },
}));
vi.mock('blockly/python', () => ({
  pythonGenerator: { workspaceToCode: vi.fn(() => '') },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeExercise(configOverrides = {}) {
  return {
    id: 42,
    title: 'Sum Two Numbers',
    version: {
      versionNumber: 1,
      description: 'Add two numbers and print the result.',
      hints: [],
      config: {
        allowedBlocks: ['text_print', 'math_arithmetic'],
        showCodeView: false,
        initialWorkspaceXml: '<xml><block type="text_print"></block></xml>',
        ...configOverrides,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockNavigate.mockClear();
});

describe('Clean student workspace', () => {
  test('does not pre-load tutor blocks into the workspace', async () => {
    const { default: Blockly } = await import('blockly');
    render(<BlocklyPracticePage exercise={makeExercise()} />);
    expect(Blockly.Xml.domToWorkspace).not.toHaveBeenCalled();
  });
});

describe('Run button', () => {
  let workerInstance;

  beforeEach(() => {
    workerInstance = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };
    const WorkerMock = vi.fn(function () { return workerInstance; });
    vi.stubGlobal('Worker', WorkerMock);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('renders a Run button', () => {
    render(<BlocklyPracticePage exercise={makeExercise()} />);
    expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument();
  });

  test('clicking Run spawns a Worker from a blob URL without postMessage', () => {
    render(<BlocklyPracticePage exercise={makeExercise()} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    expect(global.Worker).toHaveBeenCalledWith('blob:mock-url');
    expect(workerInstance.postMessage).not.toHaveBeenCalled();
  });

  test('button is disabled while running', () => {
    render(<BlocklyPracticePage exercise={makeExercise()} />);
    const btn = screen.getByRole('button', { name: /run/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(btn).toBeDisabled();
  });

  test('shows output after worker responds', async () => {
    render(<BlocklyPracticePage exercise={makeExercise()} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { output: 'hello student', error: null } });
    });
    expect(screen.getByText('hello student')).toBeInTheDocument();
  });

  test('shows error output when worker reports error', async () => {
    render(<BlocklyPracticePage exercise={makeExercise()} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { output: null, error: 'ReferenceError: x is not defined' } });
    });
    expect(screen.getByText(/ReferenceError/)).toBeInTheDocument();
  });

  test('shows TLE warning after 3 seconds', async () => {
    vi.useFakeTimers();
    render(<BlocklyPracticePage exercise={makeExercise()} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText(/Time Limit Exceeded/i)).toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe('Back button', () => {
  test('renders a back button that navigates to /student/exercises', () => {
    render(<BlocklyPracticePage exercise={makeExercise()} />);
    const backBtn = screen.getByRole('button', { name: /back to exercises/i });
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/student/exercises');
  });
});
