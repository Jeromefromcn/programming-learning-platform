// Standalone Blockly JS runner for ProgressPage read-only view.
// Accepts: { code: string }
// Posts back: { output: string } or { error: string }

function transformPromptCalls(jsCode) {
  return jsCode.replace(
    /window\.prompt\((.*?)\)/gs,
    (_, args) => `(yield { __p: true, __m: String(${args || "''"}) })`
  );
}

var __lines = [];
var __gen = null;

function print() {
  __lines.push(Array.prototype.join.call(arguments, ' '));
}

var window = {
  alert: function(x) { print(String(x)); },
};

function __step(v) {
  var r;
  try { r = __gen.next(v); }
  catch (e) {
    self.postMessage({ output: null, error: e.message });
    __gen = null;
    return;
  }
  if (r.done) {
    self.postMessage({ output: __lines.join('\n'), error: null });
    __gen = null;
  } else {
    // Input prompts not supported in progress viewer — use empty string
    __step('');
  }
}

self.onmessage = function(e) {
  var code = e.data.code || '';
  __lines = [];

  var transformed = transformPromptCalls(code);

  // Wrap in a generator to support the yield-based prompt replacement
  var genFn;
  try {
    // eslint-disable-next-line no-new-func
    genFn = new Function(
      'print', 'window',
      '"use strict";\nreturn (function* __run() {\n' + transformed + '\n});'
    );
  } catch (e) {
    self.postMessage({ output: null, error: e.message });
    return;
  }

  try {
    __gen = genFn(print, window)();
    __step(undefined);
  } catch (e) {
    self.postMessage({ output: null, error: e.message });
  }
};
