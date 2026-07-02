import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { javascriptGenerator } from 'blockly/javascript';
import { pythonGenerator } from 'blockly/python';
import { applyTrashcanStyles } from '../../utils/blocklyTrashcan';
import { createBlocklyBlobWorker } from '../../utils/blocklyWorker';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import BlocklySubmissionViewer from '../../components/BlocklySubmissionViewer';
import { studentApi } from '../../api/studentApi';
import { useAuth } from '../../contexts/AuthContext';

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
  const { user } = useAuth();
  const containerRef = useRef(null);
  const workspaceRef = useRef(null);
  const workerRef = useRef(null);
  const timeoutRef = useRef(null);

  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const [tle, setTle] = useState(false);
  const [hintIndex, setHintIndex] = useState(-1);
  const [pythonCode, setPythonCode] = useState('');
  const [inputModalMsg, setInputModalMsg] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [answerModal, setAnswerModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [savedToast, setSavedToast] = useState(false);

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

  useEffect(() => {
    studentApi.getDraft(exercise.id)
      .then(d => {
        if (d && d.workspaceXml && workspaceRef.current) {
          const dom = Blockly.utils.xml.textToDom(d.workspaceXml);
          Blockly.Xml.domToWorkspace(dom, workspaceRef.current);
        }
      })
      .catch(() => { /* ignore */ });
  }, [exercise.id]);

  function currentJsCode() {
    return workspaceRef.current
      ? javascriptGenerator.workspaceToCode(workspaceRef.current) : '';
  }
  function currentWorkspaceXml() {
    return workspaceRef.current
      ? Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspaceRef.current)) : '';
  }

  async function handleSaveDraft() {
    setSaving(true);
    try {
      await studentApi.saveDraft(exercise.id,
        { answerData: currentJsCode(), workspaceXml: currentWorkspaceXml() });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitResult(null);
    setSubmitError(null);
    const jsCode = currentJsCode();
    const xml = currentWorkspaceXml();
    try { await studentApi.saveDraft(exercise.id, { answerData: jsCode, workspaceXml: xml }); } catch { /* best-effort */ }
    try {
      const res = await studentApi.submit(exercise.id, { answerData: jsCode, workspaceXml: xml });
      setSubmitResult(res);
    } catch (e) {
      setSubmitError(e.response?.data?.error?.message || 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
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

  function handleExport() {
    const payload = {
      platformVersion: '1.0',
      exerciseId: exercise.id,
      exerciseTitle: exercise.title,
      exerciseType: 'BLOCKLY',
      exerciseVersion: version.versionNumber,
      studentName: user.username,
      displayName: user.displayName,
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
    a.download = `${user.username}_${exercise.title.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

        <button onClick={handleSaveDraft} disabled={saving}
          style={{ border: '1px solid #1976d2', color: '#1976d2', background: '#fff', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={handleSubmit} disabled={submitting}
          style={{ background: '#7b1fa2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}>
          {submitting ? 'Submitting…' : 'Submit'}
        </button>

        {config.canViewAnswer && (
          <button onClick={() => setAnswerModal(true)}
            style={{ border: '1px solid #f57c00', color: '#f57c00', background: '#fff', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}>
            Answer
          </button>
        )}

        <button
          onClick={handleExport}
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

      {savedToast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#323232', color: '#fff', padding: '10px 20px', borderRadius: 4, zIndex: 1100 }}>
          Saved
        </div>
      )}

      {submitResult && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320, textAlign: 'center' }}>
            {submitResult.showResult ? (
              <>
                <h2 style={{ marginTop: 0 }}>
                  {submitResult.passed ? '✅ Passed' : '❌ Failed'}
                </h2>
                <p style={{ fontSize: 32, margin: '8px 0' }}>{submitResult.score}</p>
              </>
            ) : (
              <h2 style={{ marginTop: 0 }}>Submitted</h2>
            )}
            <button onClick={() => setSubmitResult(null)}
              style={{ marginTop: 16, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 24px', cursor: 'pointer' }}>
              OK
            </button>
          </div>
        </div>
      )}

      {submitError && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320, textAlign: 'center' }}>
            <h2 style={{ marginTop: 0, color: '#c62828' }}>Submission Failed</h2>
            <p>{submitError}</p>
            <button onClick={() => setSubmitError(null)}
              style={{ marginTop: 16, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 24px', cursor: 'pointer' }}>
              OK
            </button>
          </div>
        </div>
      )}

      {answerModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 'min(820px, 92vw)', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Answer</h2>
              <button onClick={() => setAnswerModal(false)}
                style={{ marginLeft: 'auto', border: '1px solid #ccc', background: '#fff', borderRadius: 4, padding: '6px 14px', cursor: 'pointer' }}>
                Close
              </button>
            </div>
            <BlocklySubmissionViewer workspaceXml={config.answerWorkspaceXml} />
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
