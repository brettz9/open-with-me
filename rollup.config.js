export default {
  input: 'src/index.js',
  external: [
    'node:fs', 'node:path', 'node:child_process',
    'mdls-ts', 'lsregister', 'mac-defaults',
    'system-icon2', 'base64-js'
  ],
  output: {
    file: 'dist/index.cjs',
    format: 'cjs',
    inlineDynamicImports: true
  }
};
