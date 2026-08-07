importScripts('/pyodide/pyodide.js');

var pyodide = null;

// Bootstrap Pyodide (WASM fetch/compile + stdlib load) as soon as the worker
// starts, outside of any run's time budget — a run's timeLimitSeconds should
// only bound the student's code, matching the server-side grading semantics.
var pyodideReadyPromise = loadPyodide({ indexURL: '/pyodide/' }).then(function (p) {
  pyodide = p;
  self.postMessage({ type: 'ready' });
  return p;
});

var ERROR_MAP = [
  ['IndentationError', 'Check your indentation'],
  ['NameError',        'Variable not defined'],
  ['SyntaxError',      'Syntax error'],
  ['TypeError',        'Type mismatch'],
  ['IndexError',       'List index out of range'],
  ['ValueError',       'Invalid value'],
  ['AttributeError',   'No such attribute or method'],
];

function friendlyError(raw) {
  if (!raw) return 'An error occurred.';
  for (var i = 0; i < ERROR_MAP.length; i++) {
    if (raw.indexOf(ERROR_MAP[i][0]) !== -1) {
      var lineMatch = raw.match(/line (\d+)/i);
      var detail = lineMatch ? ' (line ' + lineMatch[1] + ')' : '';
      return ERROR_MAP[i][1] + detail;
    }
  }
  return raw.split('\n').pop() || raw;
}

self.onmessage = async function ({ data: { code, visibleTestCases } }) {
  try {
    await pyodideReadyPromise;

    var results = [];
    for (var i = 0; i < visibleTestCases.length; i++) {
      var tc = visibleTestCases[i];
      try {
        pyodide.runPython(
          'import sys, io\n' +
          'sys.stdout = io.StringIO()\n'
        );
        pyodide.runPython(code);
        var actual = String(pyodide.runPython(tc.input));
        var stdout = pyodide.runPython('sys.stdout.getvalue()');
        if (stdout.trim()) actual = stdout.trim();
        var passed = actual === String(tc.expectedOutput);
        results.push({ index: i, passed: passed, actual: actual, error: null });
      } catch (e) {
        results.push({ index: i, passed: false, actual: null, error: friendlyError(String(e)) });
      }
    }
    self.postMessage({ type: 'result', results: results, error: null });
  } catch (e) {
    self.postMessage({ type: 'result', results: [], error: String(e) });
  }
};
