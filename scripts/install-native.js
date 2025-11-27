/* eslint-disable n/no-sync,
  sonarjs/no-os-command-from-path -- Install script */
import {execSync} from 'node:child_process';
import {platform} from 'node:os';
import {existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nativeDir = join(__dirname, '../native');

// Only build on macOS
if (platform() !== 'darwin') {
  console.log('Native addon only supported on macOS. Skipping build.');
  process.exit(0);
}

// Check if we're in a CI environment or missing build tools
try {
  execSync('which node-gyp', {stdio: 'ignore'});
} catch {
  console.log('node-gyp not found. Installing native addon dependencies...');
}

// Try to build the native addon
try {
  console.log('Building native Launch Services addon...');

  if (!existsSync(nativeDir)) {
    console.log('Native addon directory not found. Skipping build.');
    process.exit(0);
  }

  // Install dependencies and build
  execSync('npm install', {
    cwd: nativeDir,
    stdio: 'inherit',
    env: {...process.env}
  });

  console.log('✓ Native addon built successfully');
} catch (error) {
  console.warn(
    '⚠ Warning: Could not build native addon. ' +
    'Will fall back to JavaScript implementation.'
  );
  console.warn('Error:', error.message);
  // Don't fail the install - the package will work with JS fallback
  process.exit(0);
}
