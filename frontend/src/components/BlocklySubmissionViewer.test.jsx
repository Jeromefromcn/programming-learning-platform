import { vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import BlocklySubmissionViewer from './BlocklySubmissionViewer';

// Blockly cannot run in jsdom — mock it entirely
vi.mock('blockly', () => {
  const mockWorkspace = {
    addChangeListener: vi.fn(),
    dispose: vi.fn(),
  };
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
  javascriptGenerator: { workspaceToCode: vi.fn(() => 'HighlightBlock();') },
}));
vi.mock('blockly/python', () => ({
  pythonGenerator: { workspaceToCode: vi.fn(() => '') },
}));
vi.mock('../utils/blocklyWorker', () => ({
  createBlocklyBlobWorker: vi.fn(),
}));

const SAMPLE_XML = '<xml xmlns="https://developers.google.com/blockly/xml"><block type="text_print"></block></xml>';
const XML_WITH_INPUT = '<xml xmlns="https://developers.google.com/blockly/xml"><block type="text_prompt_ext"></block></xml>';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BlocklySubmissionViewer', () => {
  test('shows fallback message when workspaceXml is null', () => {
    render(<BlocklySubmissionViewer workspaceXml={null} />);
    expect(screen.getByText(/visual replay not available/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /run/i })).not.toBeInTheDocument();
  });

  test('calls Blockly.inject and loads XML when workspaceXml is provided', async () => {
    const { default: Blockly } = await import('blockly');
    render(<BlocklySubmissionViewer workspaceXml={SAMPLE_XML} />);
    expect(Blockly.inject).toHaveBeenCalled();
    expect(Blockly.Xml.domToWorkspace).toHaveBeenCalled();
  });

  test('renders Run button when workspaceXml is provided', () => {
    render(<BlocklySubmissionViewer workspaceXml={SAMPLE_XML} />);
    expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument();
  });

  test('Run button shows "Running…" and is disabled while running', async () => {
    const { createBlocklyBlobWorker } = await import('../utils/blocklyWorker');
    const workerInstance = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    vi.mocked(createBlocklyBlobWorker).mockReturnValue(workerInstance);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

    render(<BlocklySubmissionViewer workspaceXml={SAMPLE_XML} />);
    const btn = screen.getByRole('button', { name: /run/i });
    fireEvent.click(btn);

    expect(screen.getByRole('button', { name: /running/i })).toBeDisabled();

    vi.restoreAllMocks();
  });

  test('shows output after worker responds', async () => {
    const { createBlocklyBlobWorker } = await import('../utils/blocklyWorker');
    const workerInstance = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    vi.mocked(createBlocklyBlobWorker).mockReturnValue(workerInstance);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

    render(<BlocklySubmissionViewer workspaceXml={SAMPLE_XML} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { output: 'hello tutor', error: null } });
    });
    expect(screen.getByText('hello tutor')).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  test('shows TLE warning after 3 seconds', async () => {
    vi.useFakeTimers();
    const { createBlocklyBlobWorker } = await import('../utils/blocklyWorker');
    const workerInstance = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    vi.mocked(createBlocklyBlobWorker).mockReturnValue(workerInstance);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

    render(<BlocklySubmissionViewer workspaceXml={SAMPLE_XML} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText(/time limit exceeded/i)).toBeInTheDocument();

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

});

describe('Blockly.inject media assets', () => {
  test('is injected with a self-hosted media path, not the default Google CDN', async () => {
    const { default: Blockly } = await import('blockly');
    render(<BlocklySubmissionViewer workspaceXml={SAMPLE_XML} />);
    expect(Blockly.inject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ media: '/blockly-media/' })
    );
  });
});
