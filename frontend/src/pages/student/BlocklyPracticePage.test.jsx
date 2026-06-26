import { vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BlocklyPracticePage from './BlocklyPracticePage';

vi.mock('../../api/studentApi', () => ({
  studentApi: {
    getDraft: vi.fn(),
    saveDraft: vi.fn(),
    submit: vi.fn(),
  },
}));

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

beforeEach(async () => {
  vi.clearAllMocks();
  const { studentApi } = await import('../../api/studentApi');
  studentApi.getDraft.mockResolvedValue(null);
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

  test('clicking Run spawns a Worker from a blob URL and sends init message', () => {
    render(<BlocklyPracticePage exercise={makeExercise()} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    expect(global.Worker).toHaveBeenCalledWith('blob:mock-url');
    expect(workerInstance.postMessage).toHaveBeenCalledWith({
      inputs: [],
      sharedBuffer: null,
    });
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

describe('Input textarea', () => {
  test('not rendered when text_prompt_ext is absent from allowedBlocks', () => {
    render(<BlocklyPracticePage exercise={makeExercise()} />);
    expect(screen.queryByLabelText(/Input \(one value per line\)/i)).not.toBeInTheDocument();
  });

  test('rendered when text_prompt_ext is in allowedBlocks', () => {
    render(<BlocklyPracticePage exercise={makeExercise({
      allowedBlocks: ['text_print', 'text_prompt_ext'],
    })} />);
    expect(screen.getByLabelText(/Input \(one value per line\)/i)).toBeInTheDocument();
  });
});

describe('Export payload', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    // Spy on Blob to capture the JSON passed to it
    vi.stubGlobal('Blob', vi.fn(function (parts) {
      global.__lastBlobParts = parts;
      this.size = 1;
      this.type = 'application/json';
    }));
    // Stub anchor click so no real download fires (only intercept 'a' tags)
    const anchor = { href: '', download: '', click: vi.fn() };
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag, ...args) =>
      tag === 'a' ? anchor : realCreateElement(tag, ...args)
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete global.__lastBlobParts;
  });

  test('exported JSON includes workspaceXml field', async () => {
    const { default: Blockly } = await import('blockly');
    vi.mocked(Blockly.Xml.domToText).mockReturnValue('<xml xmlns="..."><block type="text_print"></block></xml>');

    render(<BlocklyPracticePage exercise={makeExercise()} />);

    // Open export modal
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    // Enter student name
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Alice' } });
    // Click Download JSON
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /download json/i }));
    });

    expect(global.__lastBlobParts).toBeDefined();
    const json = JSON.parse(global.__lastBlobParts[0]);
    expect(json).toHaveProperty('workspaceXml');
    expect(json.workspaceXml).toContain('text_print');
  });
});

describe('Interactive input modal', () => {
  let workerInstance;

  beforeEach(() => {
    workerInstance = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    vi.stubGlobal('Worker', vi.fn(function () { return workerInstance; }));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('modal not shown initially', () => {
    render(<BlocklyPracticePage exercise={makeExercise({
      allowedBlocks: ['text_prompt_ext'],
    })} />);
    expect(screen.queryByRole('heading', { name: /enter input/i })).not.toBeInTheDocument();
  });

  test('modal appears when worker sends input-request', async () => {
    render(<BlocklyPracticePage exercise={makeExercise({
      allowedBlocks: ['text_prompt_ext'],
    })} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { type: 'input-request', message: 'Enter your name:' } });
    });
    expect(screen.getByRole('heading', { name: /enter input/i })).toBeInTheDocument();
    expect(screen.getByText('Enter your name:')).toBeInTheDocument();
  });

  test('modal closes and output shown when worker sends done', async () => {
    render(<BlocklyPracticePage exercise={makeExercise({
      allowedBlocks: ['text_prompt_ext'],
    })} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { type: 'input-request', message: 'Enter:' } });
    });
    await act(async () => {
      workerInstance.onmessage({ data: { type: 'done', output: 'result', error: null } });
    });
    expect(screen.queryByRole('heading', { name: /enter input/i })).not.toBeInTheDocument();
    expect(screen.getByText('result')).toBeInTheDocument();
  });

  test('clicking OK in modal closes it', async () => {
    render(<BlocklyPracticePage exercise={makeExercise({
      allowedBlocks: ['text_prompt_ext'],
    })} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { type: 'input-request', message: 'Enter:' } });
    });
    const modal = screen.getByRole('heading', { name: /enter input/i }).closest('div');
    fireEvent.change(modal.querySelector('input[type="text"]'), { target: { value: 'hello' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ok/i }));
    });
    expect(screen.queryByRole('heading', { name: /enter input/i })).not.toBeInTheDocument();
  });
});

describe('Save and Submit', () => {
  const blocklyExercise = makeExercise({ showResult: true });

  it('renders Save and Submit buttons and submits', async () => {
    const { studentApi } = await import('../../api/studentApi');
    studentApi.getDraft.mockResolvedValue(null);
    studentApi.submit.mockResolvedValue({ submissionId: 1, showResult: true, score: 100, passed: true });
    render(<MemoryRouter><BlocklyPracticePage exercise={blocklyExercise} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(studentApi.submit).toHaveBeenCalledWith(blocklyExercise.id, expect.any(Object)));
    expect((await screen.findAllByText(/通過|100/)).length).toBeGreaterThan(0);
  });
});
