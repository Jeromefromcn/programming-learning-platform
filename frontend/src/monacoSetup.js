import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// @monaco-editor/react's <Editor> defaults to fetching Monaco's AMD loader
// from https://cdn.jsdelivr.net at runtime. The platform's CSP allows only
// 'self' scripts and university networks may have no internet egress, so
// that default leaves the editor stuck on "Loading..." forever. Point the
// loader at the monaco-editor package bundled with the app instead — the
// same package already used directly by SubmissionDetailPage/ProgressPage.
loader.config({ monaco });
