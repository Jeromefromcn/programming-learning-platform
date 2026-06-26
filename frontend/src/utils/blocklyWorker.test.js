import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBlocklyBlobWorker, transformPromptCalls } from './blocklyWorker';

// Runs the worker script logic in Node.js with a mocked self.
// Handles input-request messages by responding with queued values.
function runWorkerScript(jsCode, inputs = []) {
  return new Promise((resolve) => {
    const queue = [...inputs];
    const mockSelf = {
      postMessage: null,
      onmessage: null,
    };

    mockSelf.postMessage = (msg) => {
      if (msg.type === 'done') { resolve(msg); return; }
      if (msg.type === 'input-request') {
        const val = queue.length > 0 ? queue.shift() : '';
        Promise.resolve().then(() => {
          mockSelf.onmessage({ data: { type: 'input-response', value: val } });
        });
      }
    };

    const transformed = transformPromptCalls(jsCode);
    const scriptBody = `
var __lines = [];
var __q = [];
var __gen = null;
function print() { __lines.push(Array.prototype.join.call(arguments, ' ')); }
var window = { alert: function(x) { print(String(x)); } };
function __step(v) {
  var r;
  try { r = __gen.next(v); }
  catch(e) { self.postMessage({ type: 'done', output: null, error: e.message }); __gen = null; return; }
  if (r.done) { self.postMessage({ type: 'done', output: __lines.join('\\n'), error: null }); __gen = null; }
  else if (__q.length > 0) { __step(__q.shift()); }
  else { self.postMessage({ type: 'input-request', message: r.value.__m || '' }); }
}
function* __run() { ${transformed} }
self.onmessage = function(e) {
  if (e.data.type === 'input-response') { if (__gen) __step(String(e.data.value != null ? e.data.value : '')); return; }
  __lines = []; __gen = __run(); __step(undefined);
};`;

    new Function('self', 'window', scriptBody)(mockSelf, undefined);
    mockSelf.onmessage({ data: { type: 'run' } });
  });
}

describe('transformPromptCalls', () => {
  test('transforms window.prompt(msg) into a yield expression', () => {
    const result = transformPromptCalls("var x = window.prompt('Enter:');");
    expect(result).toContain('yield');
    expect(result).toContain('__p: true');
    expect(result).toContain("String('Enter:')");
    expect(result).not.toContain('window.prompt');
  });

  test('transforms multiple prompt calls in one expression', () => {
    const result = transformPromptCalls("print(window.prompt('a'), window.prompt('b'));");
    expect(result.match(/yield/g)).toHaveLength(2);
  });

  test('leaves code without prompt calls unchanged', () => {
    const code = 'window.alert("hello");';
    expect(transformPromptCalls(code)).toBe(code);
  });

  test('handles empty args with fallback', () => {
    const result = transformPromptCalls('window.prompt()');
    expect(result).toContain("String('')");
  });
});

describe('createBlocklyBlobWorker', () => {
  let workerInstance;

  beforeEach(() => {
    workerInstance = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };
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

  test('sends initial run message to worker', () => {
    createBlocklyBlobWorker('var x = 1;');
    expect(workerInstance.postMessage).toHaveBeenCalledWith({ type: 'run' });
  });

  test('returns the Worker instance', () => {
    const result = createBlocklyBlobWorker('var x = 1;');
    expect(result).toBe(workerInstance);
  });
});

describe('worker script execution', () => {
  test('outputs print/alert results', async () => {
    const result = await runWorkerScript('window.alert("hello");');
    expect(result).toEqual({ type: 'done', output: 'hello', error: null });
  });

  test('pre-defined inputs consumed in order via interactive messages', async () => {
    const code = 'print(window.prompt("a"), window.prompt("b"), window.prompt("c"));';
    const result = await runWorkerScript(code, ['first', 'second', 'third']);
    expect(result).toEqual({ type: 'done', output: 'first second third', error: null });
  });

  test('extra prompt() calls return empty string when queue exhausted', async () => {
    const code = 'print(window.prompt(), window.prompt());';
    const result = await runWorkerScript(code, ['only-one']);
    expect(result).toEqual({ type: 'done', output: 'only-one ', error: null });
  });

  test('empty inputs: window.prompt() returns empty string', async () => {
    const code = 'print(window.prompt("what?"));';
    const result = await runWorkerScript(code, []);
    expect(result).toEqual({ type: 'done', output: '', error: null });
  });

  test('code errors are caught and reported', async () => {
    const code = 'throw new Error("test error");';
    const result = await runWorkerScript(code, []);
    expect(result).toEqual({ type: 'done', output: null, error: 'test error' });
  });

  test('interactive loop: prompt called multiple times', async () => {
    const code = `
      var a = window.prompt('first');
      var b = window.prompt('second');
      print(a + '-' + b);
    `;
    const result = await runWorkerScript(code, ['hello', 'world']);
    expect(result).toEqual({ type: 'done', output: 'hello-world', error: null });
  });

  test('Number(window.prompt()) converts response to number', async () => {
    const code = 'print(Number(window.prompt("num")) + 1);';
    const result = await runWorkerScript(code, ['41']);
    expect(result).toEqual({ type: 'done', output: '42', error: null });
  });
});
