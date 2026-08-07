import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { javascriptGenerator } from 'blockly/javascript';
import { pythonGenerator } from 'blockly/python';
import { applyTrashcanStyles } from '../../utils/blocklyTrashcan';
import { createBlocklyBlobWorker } from '../../utils/blocklyWorker';

export const AVAILABLE_BLOCKS = [
  { type: 'controls_if',              label: 'If/Else',                 category: 'Control'   },
  { type: 'controls_repeat_ext',      label: 'Repeat',                  category: 'Control'   },
  { type: 'controls_for',             label: 'For Loop',                category: 'Control'   },
  { type: 'controls_whileUntil',      label: 'While Loop',              category: 'Control'   },
  { type: 'controls_forEach',         label: 'For Each in List',        category: 'Control'   },
  { type: 'controls_flow_statements', label: 'Break / Continue',        category: 'Control'   },
  { type: 'logic_compare',            label: 'Compare',                 category: 'Logic'     },
  { type: 'logic_operation',          label: 'And / Or',                category: 'Logic'     },
  { type: 'logic_negate',             label: 'Not',                     category: 'Logic'     },
  { type: 'logic_boolean',            label: 'True / False',            category: 'Logic'     },
  { type: 'logic_null',               label: 'Null',                    category: 'Logic'     },
  { type: 'logic_ternary',            label: 'Ternary If',              category: 'Logic'     },
  { type: 'math_number',              label: 'Number',                  category: 'Math'      },
  { type: 'math_arithmetic',          label: 'Arithmetic',              category: 'Math'      },
  { type: 'math_single',              label: 'Math (sqrt, abs…)',       category: 'Math'      },
  { type: 'math_modulo',              label: 'Remainder (%)',           category: 'Math'      },
  { type: 'math_round',               label: 'Round / Floor / Ceil',    category: 'Math'      },
  { type: 'math_on_list',             label: 'Sum / Min / Max of list', category: 'Math'      },
  { type: 'math_random_int',          label: 'Random integer',          category: 'Math'      },
  { type: 'math_random_float',        label: 'Random 0–1',              category: 'Math'      },
  { type: 'math_change',              label: 'Change variable by',      category: 'Math'      },
  { type: 'math_number_property',     label: 'Is even / Is odd…',      category: 'Math'      },
  { type: 'math_trig',                label: 'Sin / Cos / Tan',         category: 'Math'      },
  { type: 'math_constant',            label: 'π / e / …',              category: 'Math'      },
  { type: 'math_constrain',           label: 'Constrain between',       category: 'Math'      },
  { type: 'text',                     label: 'Text (string)',           category: 'Text'      },
  { type: 'text_print',               label: 'Print',                   category: 'Text'      },
  { type: 'text_join',                label: 'Join text',               category: 'Text'      },
  { type: 'text_length',              label: 'Text length',             category: 'Text'      },
  { type: 'text_charAt',              label: 'Character at index',      category: 'Text'      },
  { type: 'text_indexOf',             label: 'Find in text',            category: 'Text'      },
  { type: 'text_append',              label: 'Append to variable',      category: 'Text'      },
  { type: 'text_isEmpty',             label: 'Is text empty',           category: 'Text'      },
  { type: 'text_prompt_ext',          label: 'Ask for input',           category: 'Text'      },
  { type: 'lists_create_with',        label: 'Create list',             category: 'Lists'     },
  { type: 'lists_length',             label: 'List length',             category: 'Lists'     },
  { type: 'lists_getIndex',           label: 'Get item',                category: 'Lists'     },
  { type: 'lists_setIndex',           label: 'Set item',                category: 'Lists'     },
  { type: 'lists_create_empty',       label: 'Create empty list',       category: 'Lists'     },
  { type: 'lists_isEmpty',            label: 'Is list empty',           category: 'Lists'     },
  { type: 'lists_repeat',             label: 'List with repeated item', category: 'Lists'     },
  { type: 'lists_reverse',            label: 'Reverse list',            category: 'Lists'     },
  { type: 'variables_get',            label: 'Get variable',            category: 'Variables' },
  { type: 'variables_set',            label: 'Set variable',            category: 'Variables' },
  { type: 'procedures_defnoreturn',   label: 'Define function',         category: 'Functions' },
  { type: 'procedures_defreturn',     label: 'Define function (return)',category: 'Functions' },
  { type: 'procedures_callnoreturn',  label: 'Call function',           category: 'Functions' },
  { type: 'procedures_callreturn',    label: 'Call function (return)',  category: 'Functions' },
];

export const BLOCK_CATEGORIES = ['Control', 'Logic', 'Math', 'Text', 'Lists', 'Variables', 'Functions'];

/**
 * Props:
 *   allowedBlocks: string[]         — block types checked in the checklist
 *   initialWorkspaceXml: string     — starting XML for the workspace
 *   showCodeView: boolean
 *   onAllowedBlocksChange: (types: string[]) => void
 *   onWorkspaceXmlChange: (xml: string) => void
 *   onShowCodeViewChange: (show: boolean) => void
 */
export default function BlocklyAuthoringWorkspace({
  allowedBlocks = [],
  initialWorkspaceXml = '<xml xmlns="https://developers.google.com/blockly/xml"></xml>',
  showCodeView = false,
  onAllowedBlocksChange,
  onWorkspaceXmlChange,
  onShowCodeViewChange,
}) {
  const containerRef = useRef(null);
  const workspaceRef = useRef(null);
  const preservedXmlRef = useRef(null);
  const [pythonCode, setPythonCode] = useState('');
  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const [tle, setTle] = useState(false);
  const workerRef = useRef(null);
  const timeoutRef = useRef(null);
  const [inputModalMsg, setInputModalMsg] = useState(null);
  const [inputValue, setInputValue] = useState('');

  // Rebuild workspace when allowedBlocks changes
  useEffect(() => {
    if (!containerRef.current) return;

    // Capture current XML before disposing
    if (workspaceRef.current) {
      try {
        preservedXmlRef.current = Blockly.Xml.domToText(
          Blockly.Xml.workspaceToDom(workspaceRef.current));
      } catch {
        preservedXmlRef.current = null;
      }
      workspaceRef.current.dispose();
      workspaceRef.current = null;
    }

    const toolboxXml = allowedBlocks.length > 0
      ? `<xml>${allowedBlocks.map(b => `<block type="${b}"></block>`).join('')}</xml>`
      : '<xml></xml>';

    const workspace = Blockly.inject(containerRef.current, {
      toolbox: toolboxXml,
      trashcan: true,
      scrollbars: true,
      media: '/blockly-media/',
    });
    workspaceRef.current = workspace;

    // Load preserved XML (from prior allowedBlocks change) or initial XML
    const xmlToLoad = preservedXmlRef.current || initialWorkspaceXml;
    preservedXmlRef.current = null;
    try {
      const dom = Blockly.utils.xml.textToDom(xmlToLoad);
      Blockly.Xml.domToWorkspace(dom, workspace);
    } catch {
      // Invalid XML — start empty
    }

    workspace.addChangeListener(() => {
      try {
        const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace));
        onWorkspaceXmlChange?.(xml);
        if (showCodeView) {
          setPythonCode(pythonGenerator.workspaceToCode(workspace));
        }
      } catch {
        // Ignore transient errors during block drag
      }
    });

    setTimeout(() => {
      if (containerRef.current) applyTrashcanStyles(containerRef.current);
    }, 0);

    return () => {
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, [allowedBlocks]); // Re-run when allowedBlocks changes

  useEffect(() => {
    return () => {
      if (workerRef.current) workerRef.current.terminate();
      clearTimeout(timeoutRef.current);
    };
  }, []);

  function toggleBlock(type, checked) {
    const next = checked
      ? [...allowedBlocks, type]
      : allowedBlocks.filter(b => b !== type);
    onAllowedBlocksChange?.(next);
  }

  function toggleCategory(cat, selectAll) {
    const catTypes = AVAILABLE_BLOCKS.filter(b => b.category === cat).map(b => b.type);
    const next = selectAll
      ? [...new Set([...allowedBlocks, ...catTypes])]
      : allowedBlocks.filter(t => !catTypes.includes(t));
    onAllowedBlocksChange?.(next);
  }

  function handleRun() {
    if (!workspaceRef.current) return;
    setRunning(true);
    setOutput(null);
    setTle(false);
    setInputModalMsg(null);
    if (workerRef.current) workerRef.current.terminate();
    clearTimeout(timeoutRef.current);

    let worker;
    try {
      const jsCode = javascriptGenerator.workspaceToCode(workspaceRef.current);
      worker = createBlocklyBlobWorker(jsCode);
      workerRef.current = worker;
    } catch (e) {
      setRunning(false);
      setOutput(`Error starting execution: ${e.message}`);
      return;
    }

    timeoutRef.current = setTimeout(() => {
      worker.terminate();
      workerRef.current = null;
      setRunning(false);
      setTle(true);
      setInputModalMsg(null);
    }, 3000);

    worker.onmessage = ({ data }) => {
      if (data.type === 'input-request') {
        clearTimeout(timeoutRef.current);
        setInputValue('');
        setInputModalMsg(data.message || '');
        return;
      }
      clearTimeout(timeoutRef.current);
      workerRef.current = null;
      setRunning(false);
      setInputModalMsg(null);
      setOutput(data.error ? `Error: ${data.error}` : (data.output ?? '(no output)'));
    };

    worker.onerror = (e) => {
      clearTimeout(timeoutRef.current);
      workerRef.current = null;
      setRunning(false);
      setOutput(`Error: ${e.message}`);
    };
  }

  function handleInputSubmit() {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type: 'input-response', value: inputValue });
    setInputModalMsg(null);
    setInputValue('');
    timeoutRef.current = setTimeout(() => {
      workerRef.current?.terminate();
      workerRef.current = null;
      setRunning(false);
      setTle(true);
      setInputModalMsg(null);
    }, 3000);
  }

  return (
    <div>
      {/* Block checklist */}
      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, padding: '4px 0' }}>
          Allowed Blocks ({allowedBlocks.length} selected)
        </summary>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {BLOCK_CATEGORIES.map(cat => {
            const catBlocks = AVAILABLE_BLOCKS.filter(b => b.category === cat);
            const selectedCount = catBlocks.filter(b => allowedBlocks.includes(b.type)).length;
            const allSelected = selectedCount === catBlocks.length;
            return (
              <details key={cat}>
                <summary style={{
                  cursor: 'pointer', fontWeight: 600, fontSize: 13,
                  padding: '3px 8px', background: '#e8eaf6', borderRadius: 3,
                  display: 'flex', alignItems: 'center', listStyle: 'none',
                }}>
                  {cat} ({selectedCount}/{catBlocks.length})
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); toggleCategory(cat, !allSelected); }}
                    style={{
                      marginLeft: 'auto', fontSize: 12, color: '#1976d2',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    }}
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </summary>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 4px 4px' }}>
                  {catBlocks.map(b => (
                    <label key={b.type} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      border: '1px solid #ddd', borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
                      background: allowedBlocks.includes(b.type) ? '#e3f2fd' : '#fff',
                    }}>
                      <input
                        type="checkbox"
                        checked={allowedBlocks.includes(b.type)}
                        onChange={e => toggleBlock(b.type, e.target.checked)}
                      />
                      {b.label}
                    </label>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </details>

      {/* Show Python code view toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={showCodeView}
          onChange={e => onShowCodeViewChange?.(e.target.checked)}
        />
        Show Python Code View for students
      </label>

      {/* Blockly workspace */}
      <div ref={containerRef} style={{ height: 400, border: '1px solid #ddd', borderRadius: 4 }} />

      {/* Run controls */}
      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          style={{
            background: '#1976d2', color: '#fff', border: 'none',
            borderRadius: 4, padding: '6px 18px', cursor: running ? 'not-allowed' : 'pointer', fontSize: 14,
          }}
        >
          {running ? 'Running…' : '▶ Run'}
        </button>
      </div>

      {tle && (
        <div style={{ marginTop: 8, background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 4, padding: '8px 12px', fontSize: 13 }}>
          Time Limit Exceeded (3 seconds)
        </div>
      )}

      {output !== null && (
        <pre style={{
          marginTop: 8, background: '#1e1e1e', color: '#d4d4d4',
          fontFamily: 'monospace', fontSize: 13, padding: 12,
          borderRadius: 4, overflow: 'auto', maxHeight: 200,
        }}>
          {output}
        </pre>
      )}

      {/* Python code panel */}
      {showCodeView && (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#555' }}>
            Python equivalent (live preview — read-only for students):
          </p>
          <pre style={{
            background: '#f5f5f5', padding: 12, borderRadius: 4, fontSize: 13,
            fontFamily: 'monospace', overflow: 'auto', maxHeight: 200, margin: 0,
          }}>
            {pythonCode || '(empty workspace)'}
          </pre>
        </div>
      )}

      {inputModalMsg !== null && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320 }}>
            <h3 style={{ marginTop: 0 }}>Enter input</h3>
            {inputModalMsg && (
              <p style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>{inputModalMsg}</p>
            )}
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInputSubmit()}
              style={{ width: '100%', padding: 8, boxSizing: 'border-box', marginBottom: 16 }}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleInputSubmit}
                style={{
                  background: '#1976d2', color: '#fff', border: 'none',
                  borderRadius: 4, padding: '8px 16px', cursor: 'pointer',
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
