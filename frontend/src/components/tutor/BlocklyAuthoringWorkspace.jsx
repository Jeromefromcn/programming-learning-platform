import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { pythonGenerator } from 'blockly/python';

export const AVAILABLE_BLOCKS = [
  { type: 'controls_if', label: 'If/Else' },
  { type: 'controls_repeat_ext', label: 'Repeat' },
  { type: 'controls_for', label: 'For Loop' },
  { type: 'controls_whileUntil', label: 'While Loop' },
  { type: 'logic_compare', label: 'Compare' },
  { type: 'logic_operation', label: 'And / Or' },
  { type: 'logic_negate', label: 'Not' },
  { type: 'logic_boolean', label: 'True / False' },
  { type: 'math_number', label: 'Number' },
  { type: 'math_arithmetic', label: 'Arithmetic' },
  { type: 'math_single', label: 'Math (sqrt, abs…)' },
  { type: 'text', label: 'Text (string)' },
  { type: 'text_print', label: 'Print' },
  { type: 'text_join', label: 'Join text' },
  { type: 'text_length', label: 'Text length' },
  { type: 'lists_create_with', label: 'Create list' },
  { type: 'lists_length', label: 'List length' },
  { type: 'lists_getIndex', label: 'Get item' },
  { type: 'lists_setIndex', label: 'Set item' },
  { type: 'variables_get', label: 'Get variable' },
  { type: 'variables_set', label: 'Set variable' },
  { type: 'procedures_defnoreturn', label: 'Define function' },
  { type: 'procedures_defreturn', label: 'Define function (return)' },
];

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

    return () => {
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, [allowedBlocks]); // Re-run when allowedBlocks changes

  function toggleBlock(type, checked) {
    const next = checked
      ? [...allowedBlocks, type]
      : allowedBlocks.filter(b => b !== type);
    onAllowedBlocksChange?.(next);
  }

  return (
    <div>
      {/* Block checklist */}
      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, padding: '4px 0' }}>
          Allowed Blocks ({allowedBlocks.length} selected)
        </summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {AVAILABLE_BLOCKS.map(b => (
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
    </div>
  );
}
