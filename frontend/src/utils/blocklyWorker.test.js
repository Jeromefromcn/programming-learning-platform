import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBlocklyBlobWorker } from './blocklyWorker';

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
