// Baseline profile: FMA architecture rules for ESLint (flat config).
// Use the file as is or plug it into an existing config:
//   import fma from './eslint.config.mjs'; export default [...fma, ...yourConfig];
// Cycles between modules are caught by dependency-cruiser (the no-circular rule), so the import plugin is not needed.
import tseslint from 'typescript-eslint';

const FORWARD_REF = 'forwardRef is a module boundary violation (FMA): revisit the boundary.';
const DEEP_ALIAS = '^@(app|contracts|shared)/[^/]+/.+';
// In esquery selectors a `/` inside a regular expression is not allowed; the slash is written as \x2f.
const DEEP_ALIAS_SELECTOR = '^@(app|contracts|shared)\\x2f[^\\x2f]+\\x2f.+';
const DEEP_MESSAGE =
  'Importing past the public entry point (index.ts) of a module is forbidden (FMA).';

export default [
  {
    files: ['**/*.{ts,mts,cts}'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@nestjs/common', importNames: ['forwardRef'], message: FORWARD_REF },
            { name: '@angular/core', importNames: ['forwardRef'], message: FORWARD_REF },
          ],
          patterns: [{ regex: DEEP_ALIAS, message: DEEP_MESSAGE }],
        },
      ],
      // no-restricted-imports ignores dynamic import(): it is caught separately.
      'no-restricted-syntax': [
        'error',
        {
          selector: `ImportExpression[source.value=/${DEEP_ALIAS_SELECTOR}/]`,
          message: DEEP_MESSAGE,
        },
      ],
    },
  },
];
