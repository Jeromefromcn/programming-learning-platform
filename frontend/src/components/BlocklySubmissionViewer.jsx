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
  const sharedBufferRef = useRef(null);

  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const [tle, setTle] = useState(false);
  const [preDefinedInputs, setPreDefinedInputs] = useState('');
  const [inputModalMsg, setInputModalMsg] = useState(null);
  const [inputValue, setInputValue] = useState('');

  const hasInputBlock = workspaceXml?.includes('type="text_prompt_ext"') ?? false;

  useEffect(() => {
    if (!workspaceXml || !containerRef.current) return;

    const workspace = Blockly.inject(containerRef.current, {
      readOnly: true,
      scrollbars: true,
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

  function handleRun() {
    if (!workspaceRef.current) return;
    setRunning(true);
    setOutput(null);
    setTle(false);
    setInputModalMsg(null);

    if (workerRef.current) workerRef.current.terminate();
    clearTimeout(timeoutRef.current);

    const inputs = hasInputBlock
      ? preDefinedInputs.split('\n').filter(s => s !== '')
      : [];
    const sharedBuffer = hasInputBlock ? new SharedArrayBuffer(1028) : null;
    sharedBufferRef.current = sharedBuffer;

    const jsCode = javascriptGenerator.workspaceToCode(workspaceRef.current);
    const worker = createBlocklyBlobWorker(jsCode, inputs, sharedBuffer);
    workerRef.current = worker;

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
    if (!sharedBufferRef.current) return;
    const int32View = new Int32Array(sharedBufferRef.current);
    const uint8View = new Uint8Array(sharedBufferRef.current);
    const raw = new TextEncoder().encode(inputValue);
    let encoded = raw;
    if (raw.length > 1020) {
      let end = 1020;
      while (end > 0 && (raw[end] & 0xC0) === 0x80) end--;
      encoded = raw.slice(0, end);
    }
    int32View[1] = encoded.length;
    uint8View.set(encoded, 8);
    Atomics.store(int32View, 0, 1);
    Atomics.notify(int32View, 0, 1);
    setInputModalMsg(null);
    setInputValue('');
    if (workerRef.current) {
      timeoutRef.current = setTimeout(() => {
        workerRef.current?.terminate();
        workerRef.current = null;
        setRunning(false);
        setTle(true);
        setInputModalMsg(null);
      }, 3000);
    }
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

      {hasInputBlock && (
        <div style={{ marginBottom: 12 }}>
          <label
            htmlFor="viewer-input"
            style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#555' }}
          >
            Input (one value per line):
          </label>
          <textarea
            id="viewer-input"
            rows={3}
            value={preDefinedInputs}
            onChange={e => setPreDefinedInputs(e.target.value)}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, boxSizing: 'border-box', padding: 6 }}
          />
        </div>
      )}

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
