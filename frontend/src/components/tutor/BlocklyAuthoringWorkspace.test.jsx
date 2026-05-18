import { vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import BlocklyAuthoringWorkspace, { AVAILABLE_BLOCKS, BLOCK_CATEGORIES } from './BlocklyAuthoringWorkspace';

function renderWorkspace(overrides = {}) {
  const props = {
    allowedBlocks: [],
    onAllowedBlocksChange: vi.fn(),
    onWorkspaceXmlChange: vi.fn(),
    onShowCodeViewChange: vi.fn(),
    ...overrides,
  };
  render(<BlocklyAuthoringWorkspace {...props} />);
  return props;
}

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

describe('AVAILABLE_BLOCKS data', () => {
  test('every block has a category field', () => {
    AVAILABLE_BLOCKS.forEach(b => {
      expect(b.category, `block ${b.type} missing category`).toBeTruthy();
    });
  });

  test('BLOCK_CATEGORIES exports all 7 categories', () => {
    expect(BLOCK_CATEGORIES).toEqual([
      'Control', 'Logic', 'Math', 'Text', 'Lists', 'Variables', 'Functions',
    ]);
  });

  test('every block category is in BLOCK_CATEGORIES', () => {
    AVAILABLE_BLOCKS.forEach(b => {
      expect(BLOCK_CATEGORIES).toContain(b.category);
    });
  });

  test('all 23 blocks are still present', () => {
    expect(AVAILABLE_BLOCKS).toHaveLength(23);
  });
});

describe('Block category accordion', () => {
  test('renders all 7 category names', () => {
    renderWorkspace();
    // Open the outer details first
    fireEvent.click(screen.getByText(/Allowed Blocks/));
    // Use getAllByText to handle categories whose name also appears in block labels (e.g. "Math")
    ['Control', 'Logic', 'Math', 'Text', 'Lists', 'Variables', 'Functions'].forEach(cat => {
      const matches = screen.getAllByText(new RegExp(cat));
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  test('shows (0/N) count for each category when nothing selected', () => {
    renderWorkspace();
    fireEvent.click(screen.getByText(/Allowed Blocks/));
    expect(screen.getByText(/Control \(0\/4\)/)).toBeInTheDocument();
    expect(screen.getByText(/Logic \(0\/4\)/)).toBeInTheDocument();
    expect(screen.getByText(/Math \(0\/3\)/)).toBeInTheDocument();
  });

  test('shows correct selected count when some blocks are pre-selected', () => {
    renderWorkspace({ allowedBlocks: ['controls_if', 'controls_for'] });
    fireEvent.click(screen.getByText(/Allowed Blocks/));
    expect(screen.getByText(/Control \(2\/4\)/)).toBeInTheDocument();
  });

  test('Select all button calls onAllowedBlocksChange with all blocks in category', () => {
    const props = renderWorkspace({ allowedBlocks: [] });
    fireEvent.click(screen.getByText(/Allowed Blocks/));
    // jsdom renders all <details> content regardless of open state;
    // pick the first "Select all" button which belongs to the Control category
    const selectAllButtons = screen.getAllByRole('button', { name: 'Select all', hidden: true });
    fireEvent.click(selectAllButtons[0]);
    const called = props.onAllowedBlocksChange.mock.calls[0][0];
    expect(called).toHaveLength(4);
    expect(called).toEqual(
      expect.arrayContaining(['controls_if', 'controls_repeat_ext', 'controls_for', 'controls_whileUntil'])
    );
  });

  test('Deselect all button calls onAllowedBlocksChange without category blocks', () => {
    const allControl = ['controls_if', 'controls_repeat_ext', 'controls_for', 'controls_whileUntil'];
    const props = renderWorkspace({ allowedBlocks: allControl });
    fireEvent.click(screen.getByText(/Allowed Blocks/));
    fireEvent.click(screen.getByText(/Control \(4\/4\)/));
    // hidden: true needed because jsdom renders <details> children regardless of open state
    fireEvent.click(screen.getByRole('button', { name: 'Deselect all', hidden: true }));
    const called = props.onAllowedBlocksChange.mock.calls[0][0];
    allControl.forEach(t => expect(called).not.toContain(t));
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
    // Use a proper constructor function so `new Worker(...)` works in jsdom
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
    renderWorkspace();
    expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument();
  });

  test('clicking Run spawns a Worker from a blob URL without eval', () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /▶ Run/i }));
    expect(global.Worker).toHaveBeenCalledWith('blob:mock-url');
    // Code is embedded in the blob — no postMessage needed
    expect(workerInstance.postMessage).not.toHaveBeenCalled();
  });

  test('button is disabled while running', () => {
    renderWorkspace();
    const btn = screen.getByRole('button', { name: /▶ Run/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(btn).toBeDisabled();
  });

  test('shows output after worker responds', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /▶ Run/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { output: 'hello world', error: null } });
    });
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  test('shows error output when worker reports error', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /▶ Run/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { output: null, error: 'ReferenceError: x is not defined' } });
    });
    expect(screen.getByText(/ReferenceError/)).toBeInTheDocument();
  });

  test('shows TLE warning after 3 seconds', async () => {
    vi.useFakeTimers();
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /▶ Run/i }));
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText(/Time Limit Exceeded/i)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
