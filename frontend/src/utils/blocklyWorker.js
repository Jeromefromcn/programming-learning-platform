export function transformPromptCalls(jsCode) {
  // Replace window.prompt(args) with a generator yield that pauses execution
  // and resumes with the user-supplied value. Non-greedy match works for the
  // simple string args that Blockly generates (e.g. 'Enter a number').
  return jsCode.replace(
    /window\.prompt\((.*?)\)/gs,
    (_, args) => `(yield { __p: true, __m: String(${args || "''"}) })`
  );
}

export function createBlocklyBlobWorker(jsCode, preDefinedInputs = []) {
  const transformed = transformPromptCalls(jsCode);

  const script = `
var __lines = [];
var __q = ${JSON.stringify(preDefinedInputs)};
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
    self.postMessage({ type: 'done', output: null, error: e.message });
    __gen = null;
    return;
  }
  if (r.done) {
    self.postMessage({ type: 'done', output: __lines.join('\\n'), error: null });
    __gen = null;
  } else if (__q.length > 0) {
    __step(__q.shift());
  } else {
    self.postMessage({ type: 'input-request', message: r.value.__m || '' });
  }
}

function* __run() {
${transformed}
}

self.onmessage = function (e) {
  if (e.data.type === 'input-response') {
    if (__gen) __step(String(e.data.value != null ? e.data.value : ''));
    return;
  }
  __lines = [];
  __gen = __run();
  __step(undefined);
};
`;

  const blob = new Blob([script], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  worker.postMessage({ type: 'run' });
  return worker;
}
