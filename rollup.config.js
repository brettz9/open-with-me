export default {
  input: 'src/index.js',
  external: [
    'node:fs', 'node:path', 'node:child_process',
    'mdls', 'lsregister', 'mac-defaults',
    'system-icon2', 'base64-js'
  ],
  output: {
    dir: 'dist',
    format: 'cjs'
  }
};
