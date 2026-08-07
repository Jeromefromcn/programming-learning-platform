import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { javascriptGenerator } from 'blockly/javascript';
import { createBlocklyBlobWorker } from '../utils/blocklyWorker';

const OUTPUT_STYLE = {
  background: '#1e1e1e', color: '#d4d4d4', fontFamily: 'monospace',
  fontSize: 13, padding: 12, borderRadius: 4,
  maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', margin: 0,
};

function mapError(msg) {
  if (!msg) return 'An error occurred.';
  return msg;
}

export default function BlocklySubmissionViewer({ workspaceXml }) {
  const containerRef = useRef(null);
  const workspaceRef = useRef(null);
  const workerRef = useRef(null);
  const timeoutRef = useRef(null);

  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const [tle, setTle] = useState(false);
  const [inputModalMsg, setInputModalMsg] = useState(null);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (!workspaceXml || !containerRef.current) return;

    const workspace = Blockly.inject(containerRef.current, {
      readOnly: true,
      scrollbars: true,
      media: '/blockly-media/',
    });
    workspaceRef.current = workspace;

    try {
      Blockly.Xml.domToWorkspace(
        Blockly.utils.xml.textToDom(workspaceXml),
        workspace
      );
    } catch { /* malformed XML — workspace stays empty */ }

    return () => {
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, [workspaceXml]);

  useEffect(() => {
    return () => {
      if (workerRef.current) workerRef.current.terminate();
      clearTimeout(timeoutRef.current);
    };
  }, []);

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
      setOutput(data.error ? `Error: ${mapError(data.error)}` : (data.output ?? '(no output)'));
    };

    worker.onerror = (e) => {
      clearTimeout(timeoutRef.current);
      workerRef.current = null;
      setRunning(false);
      setOutput(`Error: ${mapError(e.message)}`);
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

  if (!workspaceXml) {
    return (
      <p style={{ color: '#888', fontSize: 14, fontStyle: 'italic' }}>
        Visual replay not available for this submission (exported before workspace XML was recorded).
      </p>
    );
  }

  return (
    <div>
      <div
        ref={containerRef}
        style={{ height: 400, border: '1px solid #ddd', borderRadius: 4, marginBottom: 16 }}
      />

      <button
        onClick={handleRun}
        disabled={running}
        style={{
          background: running ? '#90caf9' : '#1976d2',
          color: '#fff', border: 'none', borderRadius: 4,
          padding: '8px 20px', cursor: running ? 'not-allowed' : 'pointer',
          marginBottom: 16,
        }}
      >
        {running ? 'Running…' : 'Run'}
      </button>

      {tle && (
        <div style={{
          background: '#fff3e0', border: '1px solid #ffb74d',
          borderRadius: 4, padding: 12, marginBottom: 12,
        }}>
          ⚠ Time Limit Exceeded (3 seconds)
        </div>
      )}

      {output !== null && <pre style={OUTPUT_STYLE}>{output}</pre>}

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
