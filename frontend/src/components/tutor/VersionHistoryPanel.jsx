import { useState } from 'react';
import { exerciseApi } from '../../api/exerciseApi';
import { formatDateTime } from '../../utils/dateFormat';

/**
 * Props:
 *   exerciseId: number
 *   versions: Array<{id, versionNumber, createdAt, isCurrent}>
 *   onRollback: () => void   — called after successful rollback so parent can reload
 */
export default function VersionHistoryPanel({ exerciseId, versions = [], onRollback }) {
  const [rolling, setRolling] = useState(false);

  async function handleRollback(version) {
    if (!confirm(
      `Roll back to version ${version.versionNumber}?\n\nThis will change the exercise students see. The status (Draft/Published) will remain unchanged.`
    )) return;

    setRolling(true);
    try {
      await exerciseApi.rollback(exerciseId, version.id);
      onRollback?.();
    } catch (e) {
      alert(e.response?.data?.error?.message || 'Rollback failed');
    } finally {
      setRolling(false);
    }
  }

  if (versions.length === 0) {
    return <p style={{ color: '#999' }}>No version history yet.</p>;
  }

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
            <th style={{ padding: 8 }}>Version</th>
            <th style={{ padding: 8 }}>Created</th>
            <th style={{ padding: 8 }}>Status</th>
            <th style={{ padding: 8 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {versions.map(v => (
            <tr key={v.id} style={{ borderBottom: '1px solid #eee',
              background: v.isCurrent ? '#f0f7ff' : 'transparent' }}>
              <td style={{ padding: 8, fontWeight: v.isCurrent ? 700 : 400 }}>
                v{v.versionNumber}
              </td>
              <td style={{ padding: 8, fontSize: 13, color: '#555' }}>
                {formatDateTime(v.createdAt)}
              </td>
              <td style={{ padding: 8 }}>
                {v.isCurrent && (
                  <span style={{ background: '#1976d2', color: '#fff',
                    borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
                    Current
                  </span>
                )}
              </td>
              <td style={{ padding: 8 }}>
                {!v.isCurrent && (
                  <button
                    onClick={() => handleRollback(v)}
                    disabled={rolling}
                    style={{ padding: '3px 10px', cursor: rolling ? 'default' : 'pointer',
                      borderRadius: 4, border: '1px solid #f57c00', color: '#f57c00', background: 'none' }}>
                    Roll back to v{v.versionNumber}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
