import { describe, it, expect, vi } from 'vitest';

// @monaco-editor/react's Editor component defaults to fetching Monaco's AMD
// loader from https://cdn.jsdelivr.net at runtime. The platform's CSP only
// allows 'self' scripts and university networks may have no internet
// egress, so that default leaves the editor stuck on "Loading..." forever.
// monacoSetup.js must point the loader at the locally bundled monaco-editor
// package instead, before any <Editor> mounts.
const configMock = vi.fn();
vi.mock('@monaco-editor/react', () => ({ loader: { config: configMock } }));
vi.mock('monaco-editor', () => ({ default: {}, editor: {} }));

describe('monacoSetup', () => {
  it('configures the monaco loader to use the local monaco-editor package', async () => {
    await import('./monacoSetup');

    expect(configMock).toHaveBeenCalledTimes(1);
    expect(configMock).toHaveBeenCalledWith({ monaco: expect.anything() });
  });
});
