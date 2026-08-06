// Standalone Pyodide runner for ProgressPage read-only view.
// Accepts: { code: string }
// Posts back: { output: string } or { error: string }

importScripts('/pyodide/pyodide.js');

var pyodide = null;

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

self.onmessage = async function(e) {
  var code = e.data.code || '';
  try {
    if (!pyodide) {
      pyodide = await loadPyodide({ indexURL: '/pyodide/' });
    }
    pyodide.runPython(
      'import sys, io\n' +
      'sys.stdout = io.StringIO()\n'
    );
    pyodide.runPython(code);
    var stdout = pyodide.runPython('sys.stdout.getvalue()');
    self.postMessage({ output: stdout || '(no output)', error: null });
  } catch (e) {
    self.postMessage({ output: null, error: friendlyError(String(e)) });
  }
};
