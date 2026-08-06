// Copies the Pyodide runtime from node_modules into public/pyodide so it's
// served same-origin (required by CSP: worker-src/script-src 'self') instead
// of the package's own default of loading from cdn.jsdelivr.net.
const { cpSync, mkdirSync } = require('fs');
const { join } = require('path');

const src = join(__dirname, '..', 'node_modules', 'pyodide');
const dest = join(__dirname, '..', 'public', 'pyodide');

mkdirSync(dest, { recursive: true });
cpSync(src, dest, {
  recursive: true,
  filter: (path) => !path.endsWith('.map'),
});

console.log('Copied Pyodide runtime to public/pyodide');
