// Keep the preview-rendering entry point available without requiring a running
// application server. The offline viewer renders the original bust/head assets;
// the existing male asset remains available in public/model.
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const result = spawnSync(process.execPath, [path.join(root, 'scripts/build-avatar-preview.cjs'), '--capture'], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) {
  console.error(result.error);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
