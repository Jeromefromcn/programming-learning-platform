import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { studentApi } from '../../api/studentApi';
import { isReauthCancelled } from '../../api/axiosInstance';
import BlocklyPracticePage from './BlocklyPracticePage';
import PythonPracticePage from './PythonPracticePage';

export default function ExercisePracticeRouter() {
  const { id } = useParams();
  const [exercise, setExercise] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    studentApi.getExercise(id)
      .then(setExercise)
      .catch(err => {
        if (isReauthCancelled(err)) return;
        if (err.response?.status === 404) setError('Exercise not found.');
        else setError('Failed to load exercise.');
      });
  }, [id]);

  if (error) return <div style={{ padding: 32 }}><p style={{ color: '#c62828' }}>{error}</p></div>;
  if (!exercise) return <div style={{ padding: 32 }}>Loading…</div>;

  if (exercise.type === 'BLOCKLY') return <BlocklyPracticePage exercise={exercise} />;
  if (exercise.type === 'PYTHON') return <PythonPracticePage exercise={exercise} />;
  return <div style={{ padding: 32 }}>Unknown exercise type: {exercise.type}</div>;
}
