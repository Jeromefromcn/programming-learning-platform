import { useState } from 'react';
import * as XLSX from 'xlsx';
import { userApi } from '../../api/userApi';

export default function ImportUsersModal({ onClose, onImported }) {
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState(null);

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const usersSheet = XLSX.utils.aoa_to_sheet([
      ['username*', 'displayName*', 'password*', 'role*'],
      ['alice', 'Alice Wang', 'pass1234', 'STUDENT'],
    ]);
    XLSX.utils.book_append_sheet(wb, usersSheet, 'Users');
    const instrSheet = XLSX.utils.aoa_to_sheet([
      ['Field', 'Required', 'Rules', 'Valid Values'],
      ['username', 'Yes', 'Unique, max 64 characters', ''],
      ['displayName', 'Yes', 'Max 128 characters', ''],
      ['password', 'Yes', 'Min 8 characters', ''],
      ['role', 'Yes', 'One of the valid values', 'STUDENT / TUTOR / SUPER_ADMIN'],
      ['', '', 'Max 500 rows per import', ''],
    ]);
    XLSX.utils.book_append_sheet(wb, instrSheet, 'Instructions');
    XLSX.writeFile(wb, 'user-import-template.xlsx');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setErrors([]);
    setSaving(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const users = rows.slice(1)
        .filter(row => row.some(cell => cell != null && cell !== ''))
        .map(row => ({
          username: String(row[0] ?? '').trim(),
          displayName: String(row[1] ?? '').trim(),
          password: String(row[2] ?? '').trim(),
          role: String(row[3] ?? '').trim(),
        }));
      const result = await userApi.importUsers(users);
      onImported(result.imported);
    } catch (err) {
      const rows = err.response?.data?.error?.rows;
      if (rows) {
        setErrors(rows);
      } else {
        setErrors([{ row: 0, field: '', message: 'Import failed. Please check your file and try again.' }]);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 8, padding: 32, width: 480 }}>
        <h3 style={{ marginBottom: 16 }}>Import Users</h3>
        <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: 4, padding: '10px 14px', marginBottom: 16 }}>
          <button type="button" onClick={downloadTemplate}
            style={{ background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: 14 }}>
            Download Template (.xlsx)
          </button>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>Includes headers, example row, and instructions</span>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="import-file" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            Select Excel File *
          </label>
          <input id="import-file" type="file" accept=".xlsx"
            onChange={e => setFile(e.target.files[0])} />
          <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>Only .xlsx format, max 500 rows</div>
        </div>
        {errors.length > 0 && (
          <div role="alert" style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#c62828' }}>
            <strong>Import failed. Please fix the following errors and retry:</strong>
            <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
              {errors.map((e, i) => (
                <li key={i}>{e.row > 0 ? `Row ${e.row}: ` : ''}{e.field ? `${e.field} — ` : ''}{e.message}</li>
              ))}
            </ul>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving || !file}
            style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>
            {saving ? 'Importing…' : 'Import'}
          </button>
        </div>
      </form>
    </div>
  );
}
