import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBlocklyBlobWorker } from './blocklyWorker';

// Helper: runs the worker script logic in Node.js context with mocked self/globals.
// jsCode is the user code string to embed; inputs is the pre-defined queue array.
function runWorkerScript(jsCode, inputs) {
  return new Promise((resolve) => {
    const messages = [];
    const mockSelf = {
      postMessage: (msg) => messages.push(msg),
      onmessage: null,
    };

    const scriptLines = [
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

    // Execute script with `self` and `window` injected (so the local `var window`
    // definition in the script shadows the jsdom global `window`).
    // We pass a placeholder for `window` so the `new Function` parameter shadows
    // the global; the script itself redefines it with `var window = {...}`.
    new Function('self', 'window', scriptLines)(mockSelf, undefined);
    // Trigger onmessage with init data
    mockSelf.onmessage({ data: { inputs, sharedBuffer: null } });
    // Return the last posted message (the "done" message)
    resolve(messages[messages.length - 1]);
  });
}

describe('createBlocklyBlobWorker', () => {
  let workerInstance;

  beforeEach(() => {
    workerInstance = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };
    // Use a regular function (not arrow) so `new Worker(...)` returns workerInstance
    vi.stubGlobal('Worker', vi.fn(function () { return workerInstance; }));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('creates a Worker from a blob URL', () => {
    createBlocklyBlobWorker('var x = 1;');
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(global.Worker).toHaveBeenCalledWith('blob:test-url');
  });

  test('revokes the blob URL after creating the worker', () => {
    createBlocklyBlobWorker('var x = 1;');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });

  test('sends init postMessage with empty inputs and null sharedBuffer by default', () => {
    createBlocklyBlobWorker('var x = 1;');
    expect(workerInstance.postMessage).toHaveBeenCalledWith({
      inputs: [],
      sharedBuffer: null,
    });
  });

  test('sends provided inputs array in init postMessage', () => {
    createBlocklyBlobWorker('var x = 1;', ['hello', '42']);
    expect(workerInstance.postMessage).toHaveBeenCalledWith({
      inputs: ['hello', '42'],
      sharedBuffer: null,
    });
  });

  test('sends provided SharedArrayBuffer in init postMessage', () => {
    const buf = new SharedArrayBuffer(1028);
    createBlocklyBlobWorker('var x = 1;', [], buf);
    expect(workerInstance.postMessage).toHaveBeenCalledWith({
      inputs: [],
      sharedBuffer: buf,
    });
  });

  test('returns the Worker instance', () => {
    const result = createBlocklyBlobWorker('var x = 1;');
    expect(result).toBe(workerInstance);
  });
});

describe('worker script prompt behavior', () => {
  // NOTE: Blockly generates `window.prompt(...)` calls, not bare `prompt(...)`.
  // Tests use `window.prompt(...)` to match actual generated code.

  test('pre-defined inputs consumed in order', async () => {
    const code = 'print(window.prompt("a"), window.prompt("b"), window.prompt("c"));';
    const result = await runWorkerScript(code, ['first', 'second', 'third']);
    expect(result).toEqual({ type: 'done', output: 'first second third', error: null });
  });

  test('extra window.prompt() calls return empty string when queue exhausted and no SharedArrayBuffer', async () => {
    const code = 'print(window.prompt(), window.prompt());';
    const result = await runWorkerScript(code, ['only-one']);
    expect(result).toEqual({ type: 'done', output: 'only-one ', error: null });
  });

  test('empty inputs and no SharedArrayBuffer: window.prompt() returns empty string', async () => {
    const code = 'print(window.prompt("what?"));';
    const result = await runWorkerScript(code, []);
    expect(result).toEqual({ type: 'done', output: '', error: null });
  });

  test('code errors are caught and reported as done with error', async () => {
    const code = 'throw new Error("test error");';
    const result = await runWorkerScript(code, []);
    expect(result).toEqual({ type: 'done', output: null, error: 'test error' });
  });
});
