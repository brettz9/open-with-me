import ashNazg from 'eslint-config-ash-nazg';

export default [
  ...ashNazg(['sauron', 'node', 'script']).map((cfg) => {
    return {
      ...cfg,
      files: ['native/index.js']
    };
  }),
  ...ashNazg(['sauron', 'node']),
  {
    files: ['scripts/**/*.js'],
    rules: {
      'unicorn/no-process-exit': 'off'
    }
  },
  {
    files: ['**/*.md/*.js'],
    rules: {
      'eol-last': 'off',
      'no-console': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'padded-blocks': 'off',
      'import/no-commonjs': 'off',
      'import/unambiguous': 'off',
      'import/no-unresolved': 'off',
      'node/no-missing-import': 'off',
      'node/no-missing-require': 'off',
      'func-names': 'off',
      'import/newline-after-import': 'off',
      strict: 'off'
    }
  }
];
