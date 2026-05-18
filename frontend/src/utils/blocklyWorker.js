export function createBlocklyBlobWorker(jsCode) {
  const script = [
    'var lines = [];',
    'function print() {',
    '  lines.push(Array.prototype.join.call(arguments, \' \'));',
    '}',
    // Blockly's JS generator emits window.alert() for text_print and
    // window.prompt() for text_prompt. Neither exists in Worker scope.
    'var window = { alert: function(x) { print(String(x)); }, prompt: function() { return \'\'; } };',
    'try {',
    jsCode,
    '  self.postMessage({ output: lines.join(\'\\n\'), error: null });',
    '} catch (e) {',
    '  self.postMessage({ output: null, error: e.message });',
    '}',
  ].join('\n');

  const blob = new Blob([script], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
}
