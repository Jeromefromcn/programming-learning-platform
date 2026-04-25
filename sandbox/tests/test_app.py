import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from unittest.mock import patch
from app import app as flask_app


@pytest.fixture
def client():
    flask_app.config['TESTING'] = True
    with flask_app.test_client() as c:
        yield c


def test_execute_returns_results_list(client):
    with patch('app.run_test_case') as mock_run:
        mock_run.return_value = {
            'passed': True, 'actual': 'Fizz', 'error': None, 'executionTimeMs': 42
        }
        resp = client.post('/execute', json={
            'code': 'def fizzbuzz(n): return "Fizz"',
            'testCases': [{'input': 'print(fizzbuzz(3))', 'expectedOutput': 'Fizz'}],
            'timeLimitSeconds': 5,
            'memoryLimitMb': 128
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'results' in data
        assert len(data['results']) == 1
        assert data['results'][0]['index'] == 0
        assert data['results'][0]['passed'] is True


def test_execute_assigns_sequential_indices(client):
    with patch('app.run_test_case') as mock_run:
        mock_run.side_effect = [
            {'passed': True, 'actual': 'Fizz', 'error': None, 'executionTimeMs': 10},
            {'passed': False, 'actual': '5', 'error': None, 'executionTimeMs': 11},
        ]
        resp = client.post('/execute', json={
            'code': '',
            'testCases': [
                {'input': 'print(1)', 'expectedOutput': 'Fizz'},
                {'input': 'print(2)', 'expectedOutput': 'Buzz'},
            ],
            'timeLimitSeconds': 5,
            'memoryLimitMb': 128
        })
        data = resp.get_json()
        assert data['results'][0]['index'] == 0
        assert data['results'][1]['index'] == 1
        assert data['results'][1]['passed'] is False
