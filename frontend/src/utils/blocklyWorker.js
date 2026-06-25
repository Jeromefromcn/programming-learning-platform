export function createBlocklyBlobWorker(jsCode, preDefinedInputs = [], sharedBuffer = null) {
  const script = [
    'var __lines = [];',
    'var __inputQueue = [];',
    'var __int32View = null;',
    'function print() {',
    '  __lines.push(Array.prototype.join.call(arguments, \' \'));',
    '}',
    'var window = {',
    '  alert: function(x) { print(String(x)); },',
    '  prompt: function(msg) {',
    '    if (__inputQueue.length > 0) { return __inputQueue.shift(); }',
    '    if (__int32View) {',
    '      self.postMessage({ type: "input-request", message: msg || "" });',
    '      try { Atomics.wait(__int32View, 0, 0); } catch(e) { return ""; }',
    '      var len = __int32View[1];',
    '      var bytes = new Uint8Array(__int32View.buffer, 8, len);',
    '      var response = new TextDecoder().decode(bytes);',
    '      Atomics.store(__int32View, 0, 0);',
    '      return response;',
    '    }',
    '    return "";',
    '  }',
    '};',
    'self.onmessage = function(e) {',
    '  __inputQueue = e.data.inputs || [];',
    '  var sharedBuf = e.data.sharedBuffer || null;',
    '  if (sharedBuf) { __int32View = new Int32Array(sharedBuf); }',
    '  try {',
    jsCode,
    '    self.postMessage({ type: "done", output: __lines.join("\\n"), error: null });',
    '  } catch(e) {',
    '    self.postMessage({ type: "done", output: null, error: e.message });',
    '  }',
    '};',
  ].join('\n');

  const blob = new Blob([script], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  worker.postMessage({ inputs: preDefinedInputs, sharedBuffer });
  return worker;
}
