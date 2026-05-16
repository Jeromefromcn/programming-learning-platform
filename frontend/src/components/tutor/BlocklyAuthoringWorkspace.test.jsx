import { vi } from 'vitest';
import { AVAILABLE_BLOCKS, BLOCK_CATEGORIES } from './BlocklyAuthoringWorkspace';

// Blockly cannot run in jsdom — mock it entirely
vi.mock('blockly', () => ({
  default: {
    inject: vi.fn(() => ({
      addChangeListener: vi.fn(),
      dispose: vi.fn(),
    })),
    Xml: {
      workspaceToDom: vi.fn(() => ({})),
      domToText: vi.fn(() => '<xml></xml>'),
      domToWorkspace: vi.fn(),
    },
    utils: { xml: { textToDom: vi.fn(() => ({})) } },
  },
}));
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
