import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { javascriptGenerator } from 'blockly/javascript';
import { pythonGenerator } from 'blockly/python';
import { applyTrashcanStyles } from '../../utils/blocklyTrashcan';
import { createBlocklyBlobWorker } from '../../utils/blocklyWorker';
import MarkdownRenderer from '../../components/MarkdownRenderer';

const OUTPUT_STYLE = {
  background: '#1e1e1e', color: '#d4d4d4', fontFamily: 'monospace',
  fontSize: 13, padding: 12, borderRadius: 4,
  maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', margin: 0,
};

function mapError(msg) {
  if (!msg) return 'An error occurred.';
  return msg;
}

export default function BlocklyPracticePage({ exercise }) {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const workspaceRef = useRef(null);
  const workerRef = useRef(null);
  const timeoutRef = useRef(null);

  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const [tle, setTle] = useState(false);
  const [hintIndex, setHintIndex] = useState(-1);
  const [exportModal, setExportModal] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [pythonCode, setPythonCode] = useState('');
  const [preDefinedInputs, setPreDefinedInputs] = useState('');
  const [inputModalMsg, setInputModalMsg] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const sharedBufferRef = useRef(null);

  const version = exercise.version;
  const config = version.config;
  const hints = version.hints || [];
  const showCodeView = config.showCodeView || false;

  useEffect(() => {
    if (!containerRef.current) return;

    const toolboxXml = config.allowedBlocks?.length > 0
      ? `<xml>${config.allowedBlocks.map(b => `<block type="${b}"></block>`).join('')}</xml>`
      : '<xml></xml>';

    const workspace = Blockly.inject(containerRef.current, {
      toolbox: toolboxXml,
      trashcan: true,
      scrollbars: true,
    });
    workspaceRef.current = workspace;

    if (showCodeView) {
      workspace.addChangeListener(() => {
        try {
          setPythonCode(pythonGenerator.workspaceToCode(workspace));
        } catch { /* ignore transient errors */ }
      });
    }

    setTimeout(() => {
      if (containerRef.current) applyTrashcanStyles(containerRef.current);
    }, 0);

    return () => { workspace.dispose(); workspaceRef.current = null; };
  }, []);

  function handleRun() {
    if (!workspaceRef.current) return;
    setRunning(true);
    setOutput(null);
    setTle(false);
    setInputModalMsg(null);

    if (workerRef.current) workerRef.current.terminate();
    clearTimeout(timeoutRef.current);

    const hasInputBlock = config.allowedBlocks?.includes('text_prompt_ext');
    const inputs = hasInputBlock
      ? preDefinedInputs.split('\n').filter(s => s !== '')
      : [];
    const sharedBuffer = hasInputBlock ? new SharedArrayBuffer(1028) : null;
    sharedBufferRef.current = sharedBuffer;

    const jsCode = javascriptGenerator.workspaceToCode(workspaceRef.current);
    const worker = createBlocklyBlobWorker(jsCode, inputs, sharedBuffer);
    workerRef.current = worker;

    function startTle() {
      timeoutRef.current = setTimeout(() => {
        worker.terminate();
        workerRef.current = null;
        setRunning(false);
        setTle(true);
        setInputModalMsg(null);
      }, 3000);
    }
    startTle();

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

  function handleExport() {
    const name = studentName.trim();
    if (!name) { alert('Please enter your name.'); return; }
    const payload = {
      platformVersion: '1.0',
      exerciseId: exercise.id,
      exerciseTitle: exercise.title,
      exerciseType: 'BLOCKLY',
      exerciseVersion: version.versionNumber,
      studentName: name,
      answer: workspaceRef.current
        ? javascriptGenerator.workspaceToCode(workspaceRef.current)
        : '',
      workspaceXml: workspaceRef.current
        ? Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspaceRef.current))
        : '',
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}_${exercise.title.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportModal(false);
    setStudentName('');
  }

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <button
        onClick={() => navigate('/student/exercises')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 0, marginBottom: 16, fontSize: 14 }}
      >
        ← Back to exercises
      </button>
      <h1>{exercise.title}</h1>
      <div style={{ color: '#555', marginBottom: 16 }}>
        <MarkdownRenderer content={version.description} />
      </div>

      <div ref={containerRef} style={{ height: 400, border: '1px solid #ddd', borderRadius: 4, marginBottom: 16 }} />

      {showCodeView && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#555' }}>Python equivalent (read-only):</p>
          <pre style={OUTPUT_STYLE}>{pythonCode || '(empty workspace)'}</pre>
        </div>
      )}

      {config.allowedBlocks?.includes('text_prompt_ext') && (
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="practice-input"
            style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#555' }}
          >
            Input (one value per line):
          </label>
          <textarea
            id="practice-input"
            rows={3}
            value={preDefinedInputs}
            onChange={e => setPreDefinedInputs(e.target.value)}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, boxSizing: 'border-box', padding: 6 }}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          onClick={handleRun}
          disabled={running}
          style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}
        >
          {running ? 'Running…' : 'Run'}
        </button>

        {hints.length > 0 && (
          <button
            onClick={() => setHintIndex(i => Math.min(i + 1, hints.length - 1))}
            disabled={hintIndex >= hints.length - 1}
            style={{ border: '1px solid #ddd', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}
          >
            {hintIndex < 0 ? 'Hint' : `Hint (${hintIndex + 1}/${hints.length})`}
          </button>
        )}

        <button
          onClick={() => setExportModal(true)}
          disabled={running}
          style={{ background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px', cursor: running ? 'not-allowed' : 'pointer', marginLeft: 'auto' }}
        >
          Export
        </button>
      </div>

      {hintIndex >= 0 && (
        <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 4, padding: 12, marginBottom: 16 }}>
          {hints[hintIndex]}
        </div>
      )}

      {tle && (
        <div style={{ background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 4, padding: 12, marginBottom: 12 }}>
          ⚠ Time Limit Exceeded (3 seconds)
        </div>
      )}
      {output !== null && <pre style={OUTPUT_STYLE}>{output}</pre>}

      {exportModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320 }}>
            <h2 style={{ marginTop: 0 }}>Export Answer</h2>
            <label htmlFor="export-student-name" style={{ display: 'block', marginBottom: 8 }}>Your name:</label>
            <input
              id="export-student-name"
              type="text"
              value={studentName}
              onChange={e => setStudentName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleExport()}
              style={{ width: '100%', padding: 8, marginBottom: 16, boxSizing: 'border-box' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setExportModal(false)}>Cancel</button>
              <button
                onClick={handleExport}
                style={{ background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}
              >
                Download JSON
              </button>
            </div>
          </div>
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
