import ashNazg from 'eslint-config-ash-nazg';

export default [
  ...ashNazg(['sauron', 'node']),
  {
    files: ['**/*.md/*.js'],
    rules: {
      'eol-last': 'off',
      'no-console': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'warn',
      'padded-blocks': 'off',
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
