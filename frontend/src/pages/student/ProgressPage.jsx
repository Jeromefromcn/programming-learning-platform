import { useEffect, useState } from 'react';
import { progressApi } from '../../api/progressApi';

function chipStyle(status, score) {
  if (status === 'GRADED') {
    return score >= 60
      ? { label: 'Graded', bg: '#16a34a', color: '#fff' }
      : { label: 'Graded', bg: '#dc2626', color: '#fff' };
  }
  if (status === 'ATTEMPTED') return { label: 'Attempted', bg: '#f59e0b', color: '#fff' };
  return { label: 'Not Attempted', bg: '#9e9e9e', color: '#fff' };
}

function SummaryCard({ label, value }) {
  return (
    <div style={{
      flex: 1, minWidth: 140, border: '1px solid #e0e0e0', borderRadius: 8,
      padding: '16px 20px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#1976d2' }}>{value}</div>
      <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function ProgressPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    progressApi.getProgress()
      .then(setData)
      .catch(() => setError('Failed to load progress.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;
  if (error)   return <div style={{ padding: 32, color: 'red' }}>{error}</div>;

  const { summary, exercises } = data;

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24 }}>My Progress</h2>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
        <SummaryCard label="Total Exercises" value={summary.totalExercises} />
        <SummaryCard label="Attempted" value={summary.attemptedCount} />
        <SummaryCard label="Graded" value={summary.gradedCount} />
        <SummaryCard
          label="Avg Score / Pass Rate"
          value={`${summary.averageScore.toFixed(1)} / ${summary.passRate.toFixed(1)}%`}
        />
      </div>

      {exercises.length === 0 ? (
        <p style={{ color: '#888' }}>No exercises available.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>Exercise</th>
              <th style={{ padding: '8px 12px' }}>Type</th>
              <th style={{ padding: '8px 12px' }}>Status</th>
              <th style={{ padding: '8px 12px' }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {exercises.map(ex => {
              const chip = chipStyle(ex.status, ex.score);
              return (
                <tr key={ex.exerciseId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{ex.exerciseTitle}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: ex.exerciseType === 'BLOCKLY' ? '#ede9fe' : '#dbeafe',
                      color: ex.exerciseType === 'BLOCKLY' ? '#7c3aed' : '#1d4ed8',
                      borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600,
                    }}>
                      {ex.exerciseType}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: chip.bg, color: chip.color,
                      borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 600,
                    }}>
                      {chip.label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {ex.score != null ? (
                      <>
                        <span style={{ fontWeight: 600 }}>{ex.score.toFixed(1)} / 100</span>
                        <div style={{ fontSize: 11, color: '#888' }}>
                          {ex.scoreSource === 'TUTOR' ? 'Tutor Score' : 'Auto Score'}
                        </div>
                      </>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
