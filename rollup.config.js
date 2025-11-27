export default {
  input: 'src/index.js',
  external: [
    'node:fs', 'node:path', 'node:child_process',
    '@fiahfy/icns', 'datauri/parser.js', 'mdls', 'lsregister', 'mac-defaults'
  ],
  output: {
    dir: 'dist',
    format: 'cjs'
  }
};
