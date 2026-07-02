import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { exerciseApi } from '../../api/exerciseApi';
import { categoryApi } from '../../api/categoryApi';
import { isReauthCancelled } from '../../api/axiosInstance';
import BlocklyAuthoringWorkspace from '../../components/tutor/BlocklyAuthoringWorkspace';
import PythonAuthoringEditor from '../../components/tutor/PythonAuthoringEditor';
import VersionHistoryPanel from '../../components/tutor/VersionHistoryPanel';
import Breadcrumb from '../../components/Breadcrumb';
import MarkdownEditor from '../../components/MarkdownEditor';
import RubricEditor from '../../components/RubricEditor';

const EMPTY_BLOCKLY_CONFIG = {
  allowedBlocks: [],
  initialWorkspaceXml: '<xml xmlns="https://developers.google.com/blockly/xml"></xml>',
  showCodeView: false,
  autoGrade: true,
  canViewAnswer: false,
  rubric: { dimensions: [] },
  gradingRules: {
    outputMatch: { enabled: false, expectedOutput: '' },
    requiredBlocks: { enabled: false, blocks: [] },
    forbiddenBlocks: { enabled: false, blocks: [] },
    blockCountLimit: { enabled: false, max: null },
  },
};

const EMPTY_PYTHON_CONFIG = {
  starterCode: '',
  timeLimitSeconds: 5,
  testCases: [],
  autoGrade: true,
  rubric: { dimensions: [] },
};

export default function ExerciseFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [categories, setCategories] = useState([]);
  const [versions, setVersions] = useState([]);
  const [activeTab, setActiveTab] = useState('edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [exerciseType, setExerciseType] = useState('');
  const [difficulty, setDifficulty] = useState('EASY');
  const [categoryId, setCategoryId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [hints, setHints] = useState('');
  const [blocklyConfig, setBlocklyConfig] = useState(EMPTY_BLOCKLY_CONFIG);
  const [pythonConfig, setPythonConfig] = useState(EMPTY_PYTHON_CONFIG);

  useEffect(() => {
    categoryApi.list(0, 200).then(d => setCategories(d.content));
    if (isEdit) {
      loadExercise();
      loadVersions();
    }
  }, [id]);

  async function loadExercise() {
    try {
      const ex = await exerciseApi.get(id);
      setTitle(ex.title);
      setDescription(ex.currentVersion.description);
      setExerciseType(ex.type);
      setDifficulty(ex.currentVersion.difficulty);
      setCategoryId(ex.categoryId ? String(ex.categoryId) : '');
      setDeadline(ex.deadline ? ex.deadline.slice(0, 16) : '');
      setHints((ex.currentVersion.hints || []).join('\n'));
      if (ex.type === 'BLOCKLY') {
        setBlocklyConfig(ex.currentVersion.config || EMPTY_BLOCKLY_CONFIG);
      } else {
        setPythonConfig(ex.currentVersion.config || EMPTY_PYTHON_CONFIG);
      }
    } catch (err) {
      if (isReauthCancelled(err)) return;
      setError('Failed to load exercise.');
    }
  }

  async function loadVersions() {
    try {
      const data = await exerciseApi.listVersions(id);
      setVersions(data);
    } catch {
      // non-critical
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Validate rubric if manual grading mode
    const activeConfig = exerciseType === 'BLOCKLY' ? blocklyConfig : pythonConfig;
    if (!activeConfig.autoGrade) {
      const dims = activeConfig.rubric?.dimensions || [];
      if (dims.length === 0) {
        setError('Add at least one scoring dimension.');
        setSaving(false);
        return;
      }
      const sum = dims.reduce((acc, d) => acc + (parseFloat(d.weight) || 0), 0);
      if (Math.abs(sum - 1) > 1e-6) {
        setError('Dimension weights must sum to exactly 1.0.');
        setSaving(false);
        return;
      }
    }

    try {
      const config = exerciseType === 'BLOCKLY'
        ? { ...blocklyConfig, answerWorkspaceXml: blocklyConfig.initialWorkspaceXml }
        : pythonConfig;
      const payload = {
        title,
        description,
        difficulty,
        categoryId: categoryId ? Number(categoryId) : null,
        hints: hints.split('\n').map(h => h.trim()).filter(Boolean),
        config,
        deadline: deadline || null,
      };

      if (isEdit) {
        await exerciseApi.update(id, payload);
        navigate('/tutor/exercises');
      } else {
        await exerciseApi.create({ ...payload, type: exerciseType });
        navigate('/tutor/exercises');
      }
    } catch (e) {
      if (isReauthCancelled(e)) return;
      setError(e.response?.data?.error?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  if (!isEdit && !exerciseType) {
    return (
      <div style={{ padding: 32, maxWidth: 600 }}>
        <Breadcrumb items={[
          { label: 'Exercises', to: '/tutor/exercises' },
          { label: 'New Exercise' },
        ]} />
        <h1>New Exercise</h1>
        <p>Select an exercise type to continue:</p>
        <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
          <button onClick={() => setExerciseType('BLOCKLY')}
            style={{ flex: 1, padding: 24, border: '2px solid #1976d2', borderRadius: 8,
                     cursor: 'pointer', background: '#fff', fontSize: 16 }}>
            <div style={{ fontSize: 24 }}>Blockly</div>
            <div style={{ fontWeight: 700, marginTop: 8 }}>Blockly</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Visual block-based programming</div>
          </button>
          <button onClick={() => setExerciseType('PYTHON')}
            style={{ flex: 1, padding: 24, border: '2px solid #1976d2', borderRadius: 8,
                     cursor: 'pointer', background: '#fff', fontSize: 16 }}>
            <div style={{ fontSize: 24 }}>Python</div>
            <div style={{ fontWeight: 700, marginTop: 8 }}>Python</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Text-based code editor</div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <Breadcrumb items={[
        { label: 'Exercises', to: '/tutor/exercises' },
        { label: isEdit ? 'Edit Exercise' : 'New Exercise' },
      ]} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>
          {isEdit ? 'Edit Exercise' : `New ${exerciseType} Exercise`}
        </h1>
        {isEdit && (
          <div style={{ display: 'flex', gap: 0 }}>
            {['edit', 'versions'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ padding: '6px 16px', cursor: 'pointer',
                  background: activeTab === tab ? '#1976d2' : '#fff',
                  color: activeTab === tab ? '#fff' : '#333',
                  border: '1px solid #ccc',
                  borderRadius: tab === 'edit' ? '4px 0 0 4px' : '0 4px 4px 0' }}>
                {tab === 'edit' ? 'Edit' : `Versions (${versions.length})`}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => navigate('/tutor/exercises')}
          style={{ marginLeft: 'auto', padding: '6px 14px', cursor: 'pointer',
                   border: '1px solid #ccc', borderRadius: 4, background: '#fff' }}>
          Back
        </button>
      </div>

      {activeTab === 'versions' && isEdit ? (
        <VersionHistoryPanel
          exerciseId={Number(id)}
          versions={versions}
          onRollback={loadVersions}
        />
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr', marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Title *</label>
              <input required value={title} onChange={e => setTitle(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Difficulty *</label>
              <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4 }}>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Category</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4 }}>
                <option value="">— None —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Hints (one per line)</label>
              <textarea value={hints} onChange={e => setHints(e.target.value)} rows={3}
                placeholder="Optional hints for students"
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label htmlFor="deadline" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
                Deadline (optional)
              </label>
              <input id="deadline" type="datetime-local" value={deadline}
                onChange={e => setDeadline(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Description *</label>
            <MarkdownEditor value={description} onChange={setDescription} rows={4} required />
          </div>

          {exerciseType === 'BLOCKLY' ? (
            <div>
              <h3 style={{ marginTop: 0 }}>Blockly Configuration</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                <input
                  type="checkbox"
                  checked={blocklyConfig.canViewAnswer === true}
                  onChange={e =>
                    setBlocklyConfig(prev => ({ ...prev, canViewAnswer: e.target.checked }))}
                />
                Allow students to view the answer
              </label>
              <BlocklyAuthoringWorkspace
                allowedBlocks={blocklyConfig.allowedBlocks || []}
                initialWorkspaceXml={blocklyConfig.initialWorkspaceXml}
                showCodeView={blocklyConfig.showCodeView}
                onAllowedBlocksChange={blocks =>
                  setBlocklyConfig(prev => ({ ...prev, allowedBlocks: blocks }))}
                onWorkspaceXmlChange={xml =>
                  setBlocklyConfig(prev => ({ ...prev, initialWorkspaceXml: xml }))}
                onShowCodeViewChange={show =>
                  setBlocklyConfig(prev => ({ ...prev, showCodeView: show }))}
              />

              <h3 style={{ marginTop: 24 }}>Grading Configuration</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                <input
                  type="checkbox"
                  checked={blocklyConfig.autoGrade !== false}
                  onChange={e => setBlocklyConfig(prev => ({ ...prev, autoGrade: e.target.checked }))}
                />
                Enable automatic grading
              </label>
              {blocklyConfig.autoGrade ? (
                <>
                  <h4 style={{ marginTop: 24 }}>Grading Rules</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input type="checkbox"
                        checked={blocklyConfig.gradingRules?.outputMatch?.enabled || false}
                        onChange={e => setBlocklyConfig(prev => ({
                          ...prev,
                          gradingRules: { ...prev.gradingRules,
                            outputMatch: { ...prev.gradingRules?.outputMatch, enabled: e.target.checked } }}))} />
                      Output Match
                      {blocklyConfig.gradingRules?.outputMatch?.enabled && (
                        <input
                          value={blocklyConfig.gradingRules?.outputMatch?.expectedOutput || ''}
                          onChange={e => setBlocklyConfig(prev => ({
                            ...prev,
                            gradingRules: { ...prev.gradingRules,
                              outputMatch: { ...prev.gradingRules?.outputMatch, expectedOutput: e.target.value } }}))}
                          placeholder="Expected output"
                          style={{ flex: 1, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4 }} />
                      )}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input type="checkbox"
                        checked={blocklyConfig.gradingRules?.blockCountLimit?.enabled || false}
                        onChange={e => setBlocklyConfig(prev => ({
                          ...prev,
                          gradingRules: { ...prev.gradingRules,
                            blockCountLimit: { ...prev.gradingRules?.blockCountLimit, enabled: e.target.checked } }}))} />
                      Block Count Limit
                      {blocklyConfig.gradingRules?.blockCountLimit?.enabled && (
                        <input type="number" min={1}
                          value={blocklyConfig.gradingRules?.blockCountLimit?.max || ''}
                          onChange={e => setBlocklyConfig(prev => ({
                            ...prev,
                            gradingRules: { ...prev.gradingRules,
                              blockCountLimit: { ...prev.gradingRules?.blockCountLimit, max: parseInt(e.target.value) || null } }}))}
                          placeholder="Max blocks"
                          style={{ width: 80, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4 }} />
                      )}
                    </label>
                  </div>
                </>
              ) : (
                <RubricEditor
                  dimensions={blocklyConfig.rubric?.dimensions || []}
                  onChange={dims => setBlocklyConfig(prev => ({
                    ...prev, rubric: { dimensions: dims }
                  }))}
                />
              )}
            </div>
          ) : (
            <div>
              <h3 style={{ marginTop: 0 }}>Python Configuration</h3>
              <PythonAuthoringEditor
                starterCode={pythonConfig.starterCode || ''}
                timeLimitSeconds={pythonConfig.timeLimitSeconds || 5}
                testCases={pythonConfig.testCases || []}
                onStarterCodeChange={code =>
                  setPythonConfig(prev => ({ ...prev, starterCode: code }))}
                onTimeLimitChange={secs =>
                  setPythonConfig(prev => ({ ...prev, timeLimitSeconds: secs }))}
                onTestCasesChange={cases =>
                  setPythonConfig(prev => ({ ...prev, testCases: cases }))}
              />
              <h3 style={{ marginTop: 24 }}>Grading Configuration</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                <input
                  type="checkbox"
                  checked={pythonConfig.autoGrade !== false}
                  onChange={e => setPythonConfig(prev => ({ ...prev, autoGrade: e.target.checked }))}
                />
                Enable automatic grading
              </label>
              {!pythonConfig.autoGrade && (
                <RubricEditor
                  dimensions={pythonConfig.rubric?.dimensions || []}
                  onChange={dims => setPythonConfig(prev => ({
                    ...prev, rubric: { dimensions: dims }
                  }))}
                />
              )}
            </div>
          )}

          {error && (
            <p style={{ color: '#c62828', marginTop: 16 }}>{error}</p>
          )}

          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <button type="submit" disabled={saving}
              style={{ padding: '10px 24px', background: '#1976d2', color: '#fff',
                       border: 'none', borderRadius: 4, cursor: saving ? 'default' : 'pointer', fontSize: 15 }}>
              {saving ? 'Saving…' : (isEdit ? 'Save (creates new version)' : 'Create Exercise')}
            </button>
            <button type="button" onClick={() => navigate('/tutor/exercises')}
              style={{ padding: '10px 16px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
