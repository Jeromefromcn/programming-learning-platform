import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importBatchApi, downloadBatchExport } from '../../api/importBatchApi';
import { useTab } from '../../contexts/TabContext';
import Pagination from '../../components/Pagination';
import { formatDateTime } from '../../utils/dateFormat';

const STATUS_COLORS = {
  ALL:     { bg: '#e8f5e9', color: '#2e7d32' },
  PARTIAL: { bg: '#fff3e0', color: '#e65100' },
  NONE:    { bg: '#f5f5f5', color: '#888' },
};

export default function GroupSubmissionPage() {
  const navigate = useNavigate();
  const { openTabAt } = useTab();
  const [batches, setBatches] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [pendingBatchId, setPendingBatchId] = useState('');
  const [pendingGradedStatus, setPendingGradedStatus] = useState('');
  const [batchId, setBatchId] = useState('');
  const [gradedStatus, setGradedStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [searchTrigger, setSearchTrigger] = useState(0);

  async function fetchBatches(params) {
    setLoading(true);
    try {
      const data = await importBatchApi.list(params);
      setBatches(data.content);
      setTotalPages(data.totalPages);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = { page, size: 20 };
    if (batchId.trim()) params.batchId = batchId.trim();
    if (gradedStatus) params.gradedStatus = gradedStatus;
    fetchBatches(params);
  }, [page, batchId, gradedStatus, searchTrigger]);

  function handleSearch() {
    setPage(0);
    setBatchId(pendingBatchId);
    setGradedStatus(pendingGradedStatus);
    setSearchTrigger(s => s + 1);
  }

  async function handleDelete(batch) {
    let msg = `Delete batch #${batch.id} and its ${batch.importedCount} imported submissions?\nThis cannot be undone.`;
    if (batch.gradedStatus === 'ALL') {
      msg = `Warning: This batch is fully graded.\n\n` + msg;
    }
    if (!window.confirm(msg)) return;
    setDeletingId(batch.id);
    try {
      await importBatchApi.delete(batch.id);
      const params = { page, size: 20 };
      if (batchId.trim()) params.batchId = batchId.trim();
      if (gradedStatus) params.gradedStatus = gradedStatus;
      fetchBatches(params);
    } catch {
      alert('Failed to delete batch.');
    } finally {
      setDeletingId(null);
    }
  }

  function handleExport(batch) {
    if (batch.gradedStatus !== 'ALL') {
      if (!window.confirm(
        `Not all submissions in this batch are graded.\nExport anyway?`
      )) return;
    }
    downloadBatchExport(batch.id);
  }

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Group Submissions</h1>
        <button
          onClick={() => navigate('/tutor/group-submissions/import')}
          style={{
            background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4,
            padding: '8px 18px', cursor: 'pointer', fontSize: 14,
          }}
        >
          Import Files
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <input
          placeholder="Filter by batch ID…"
          value={pendingBatchId}
          onChange={e => setPendingBatchId(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', width: 160 }}
        />
        <label>
          Graded Status:
          <select
            value={pendingGradedStatus}
            onChange={e => setPendingGradedStatus(e.target.value)}
            style={{ marginLeft: 8 }}
          >
            <option value="">All</option>
            <option value="ALL">Fully Graded</option>
            <option value="PARTIAL">Partially Graded</option>
            <option value="NONE">Not Graded</option>
          </select>
        </label>
        <button
          onClick={handleSearch}
          style={{ padding: '6px 18px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Search
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#888' }}>Loading…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
              {['Import ID', 'Date', 'Files', 'Imported', 'Duplicates', 'Failed', 'Graded Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No import batches found.</td></tr>
            ) : batches.map(b => {
              const sc = STATUS_COLORS[b.gradedStatus] || STATUS_COLORS.NONE;
              return (
                <tr key={b.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>#{b.id}</td>
                  <td style={{ padding: '10px 12px', color: '#888', fontSize: 12 }}>
                    {formatDateTime(b.createdAt)}
                  </td>
                  <td style={{ padding: '10px 12px' }}>{b.fileCount}</td>
                  <td style={{ padding: '10px 12px' }}>{b.importedCount}</td>
                  <td style={{ padding: '10px 12px' }}>{b.duplicateCount}</td>
                  <td style={{ padding: '10px 12px' }}>{b.failedCount}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: sc.bg, color: sc.color,
                      borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 600,
                    }}>
                      {b.gradedStatus}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => openTabAt('submissions', `/tutor/submissions?batchId=${b.id}`)}
                      style={{
                        padding: '4px 14px', background: '#1976d2', color: '#fff',
                        border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                      }}
                    >
                      View Submissions
                    </button>
                    <button
                      onClick={() => handleExport(b)}
                      style={{
                        padding: '4px 14px', background: '#388e3c', color: '#fff',
                        border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                      }}
                    >
                      Export CSV
                    </button>
                    <button
                      onClick={() => handleDelete(b)}
                      disabled={deletingId === b.id}
                      style={{
                        padding: '4px 14px', color: '#c62828', background: 'none',
                        border: '1px solid #c62828', borderRadius: 4,
                        cursor: deletingId === b.id ? 'default' : 'pointer', fontSize: 12,
                        opacity: deletingId === b.id ? 0.5 : 1,
                      }}
                    >
                      {deletingId === b.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
