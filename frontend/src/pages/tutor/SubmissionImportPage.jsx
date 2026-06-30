import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submissionApi } from '../../api/submissionApi';
import Breadcrumb from '../../components/Breadcrumb';

const STATUS_COLOR = { IMPORTED: '#2e7d32', DUPLICATE: '#e65100', FAILED: '#c62828' };
const STATUS_BG = { IMPORTED: '#e8f5e9', DUPLICATE: '#fff3e0', FAILED: '#ffebee' };

export default function SubmissionImportPage() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [forceLoading, setForceLoading] = useState({});

  function handleDrop(e) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(isValidFile);
    setSelectedFiles(files);
    setResponse(null);
  }

  function handleFileChange(e) {
    const files = Array.from(e.target.files).filter(isValidFile);
    setSelectedFiles(files);
    setResponse(null);
  }

  function isValidFile(f) {
    return f.name.endsWith('.json') || f.name.endsWith('.zip');
  }

  async function handleImport() {
    if (!selectedFiles.length) return;
    const formData = new FormData();
    selectedFiles.forEach(f => formData.append('files', f));
    setLoading(true);
    try {
      const data = await submissionApi.importFiles(formData);
      setResponse(data);
      if (!data.ok) return; // problems are shown below
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Import failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForceImport(batchId, filename, index) {
    setForceLoading(prev => ({ ...prev, [index]: true }));
    try {
      const data = await submissionApi.forceImport(batchId, filename);
      setResponse(prev => {
        const results = [...prev.results];
        results[index] = data;
        const imported = results.filter(r => r.status === 'IMPORTED').length;
        const duplicates = results.filter(r => r.status === 'DUPLICATE').length;
        const failed = results.filter(r => r.status === 'FAILED').length;
        return { ...prev, results, summary: { ...prev.summary, imported, duplicates, failed } };
      });
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Force import failed.');
    } finally {
      setForceLoading(prev => ({ ...prev, [index]: false }));
    }
  }

  const { summary, results, batchId } = response || {};

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <Breadcrumb items={[
        { label: 'Group Submissions', to: '/tutor/group-submissions' },
        { label: 'Import' },
      ]} />
      <div style={{ padding: '12px 20px 0' }}>
        <button
          onClick={() => navigate('/tutor/group-submissions')}
          style={{
            background: 'none', border: '1px solid #ccc', borderRadius: 4,
            padding: '5px 12px', fontSize: 13, cursor: 'pointer', color: '#555',
          }}
        >
          ← Back to Group Submissions
        </button>
      </div>
      <h1>Import Submissions</h1>

      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current.click()}
        style={{
          border: '2px dashed #90caf9', borderRadius: 8, padding: 40,
          textAlign: 'center', cursor: 'pointer', background: '#f3f8ff', marginBottom: 16,
        }}
      >
        <p style={{ margin: 0, color: '#555' }}>
          Drop <strong>.json</strong> or <strong>.zip</strong> files here, or click to browse
        </p>
        {selectedFiles.length > 0 && (
          <p style={{ margin: '8px 0 0', color: '#1976d2' }}>
            {selectedFiles.length} file(s) selected: {selectedFiles.map(f => f.name).join(', ')}
          </p>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".json,.zip" multiple hidden onChange={handleFileChange} />

      <button
        onClick={handleImport}
        disabled={!selectedFiles.length || loading}
        style={{
          background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4,
          padding: '10px 24px', cursor: 'pointer', fontSize: 15, marginBottom: 24,
        }}
      >
        {loading ? 'Importing…' : 'Import'}
      </button>

      {summary && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: '#f5f5f5', borderRadius: 4 }}>
          <strong>
            {summary.imported} imported &nbsp;·&nbsp;
            {summary.duplicates} duplicates &nbsp;·&nbsp;
            {summary.failed} failed
          </strong>
        </div>
      )}

      {response && !response.ok && response.problems && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#ffebee', borderRadius: 4, border: '1px solid #ef9a9a' }}>
          <strong style={{ color: '#c62828' }}>Import failed — fix the following issues and re-import:</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {response.problems.map((p, i) => (
              <li key={i} style={{ color: '#c62828', fontSize: 13, marginTop: 4 }}>
                <strong>{p.filename}</strong>: {p.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {results && results.map((r, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', marginBottom: 8, borderRadius: 4,
          background: STATUS_BG[r.status] || '#fafafa',
        }}>
          <div>
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12,
              fontWeight: 700, marginRight: 10,
              background: STATUS_COLOR[r.status] || '#888', color: '#fff',
            }}>
              {r.status}
            </span>
            <strong>{r.filename}</strong>
            {r.studentName && <span style={{ color: '#555', marginLeft: 8 }}>{r.studentName}</span>}
            {r.exerciseTitle && <span style={{ color: '#555', marginLeft: 8 }}>— {r.exerciseTitle}</span>}
            {r.autoScore != null && (
              <span style={{ marginLeft: 8, color: '#333' }}>Score: {r.autoScore}</span>
            )}
            {r.message && <span style={{ color: '#c62828', marginLeft: 8 }}>{r.message}</span>}
          </div>
          {r.status === 'DUPLICATE' && (
            <button
              onClick={() => handleForceImport(batchId, r.filename, i)}
              disabled={forceLoading[i]}
              style={{
                background: '#e65100', color: '#fff', border: 'none', borderRadius: 4,
                padding: '4px 14px', cursor: 'pointer', fontSize: 13,
              }}
            >
              {forceLoading[i] ? 'Importing…' : 'Force Import'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
