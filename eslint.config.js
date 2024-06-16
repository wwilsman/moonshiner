import js from '@eslint/js';
import globals from 'globals';
import neostandard from 'neostandard';

export default [
  { ignores: ['.local-*', 'coverage'] },
  ...neostandard(),
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser
      }
    },
    rules: {
      'curly': 'off',
      'no-sequences': 'off',
      'no-sparse-arrays': 'off',
      'no-void': 'off',
      'no-return-assign': 'off',
      'prefer-const': 'off',
      '@stylistic/comma-dangle': ['error', 'never'],
      '@stylistic/generator-star-spacing': ['error', {
        before: false,
        after: true,
        anonymous: 'neither',
        method: 'before'
      }],
      '@stylistic/multiline-ternary': 'off',
      '@stylistic/quote-props': ['error', 'consistent-as-needed'],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/space-before-function-paren': ['error', {
        anonymous: 'never',
        asyncArrow: 'always',
        named: 'never'
      }],
      '@stylistic/yield-star-spacing': ['error', 'after']
    }
  }
];
