import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { TEMPLATES, binPath, makeFixture, run } from './helpers.mjs';

const ESLINT = binPath('eslint');
const CONFIG = path.join(TEMPLATES, 'eslint.config.mjs');
const lint = (files) => run(ESLINT, ['-c', CONFIG, '.'], makeFixture(files));

test('clean TypeScript code passes (including import type)', () => {
  const r = lint({
    'a.ts': "import type { B } from './b';\nimport { b } from './b';\nexport const a: B = b;\n",
    'b.ts': 'export type B = number;\nexport const b: B = 1;\n',
  });
  assert.equal(r.code, 0, r.out);
});

test('forwardRef from @nestjs/common is forbidden', () => {
  const r = lint({ 'a.ts': "import { forwardRef } from '@nestjs/common';\nexport const x = forwardRef;\n" });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /no-restricted-imports/);
});

test('forwardRef from @angular/core is forbidden', () => {
  const r = lint({ 'a.ts': "import { forwardRef } from '@angular/core';\nexport const x = forwardRef;\n" });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /no-restricted-imports/);
});

test('an alias import that bypasses index.ts is forbidden', () => {
  for (const spec of ['@app/cart/cart.state', '@contracts/cart/dto', '@shared/ui/button']) {
    const r = lint({ 'a.ts': `import { x } from '${spec}';\nexport const y = x;\n` });
    assert.notEqual(r.code, 0, `${spec}: ${r.out}`);
    assert.match(r.out, /no-restricted-imports/);
  }
});

test('an alias import of a public entry point and of a shared segment is allowed', () => {
  for (const spec of ['@app/cart', '@contracts/cart', '@shared/ui']) {
    const r = lint({ 'a.ts': `import { x } from '${spec}';\nexport const y = x;\n` });
    assert.equal(r.code, 0, `${spec}: ${r.out}`);
  }
});

test('a dynamic import() that bypasses index.ts is forbidden too', () => {
  const r = lint({ 'a.ts': "export const load = () => import('@app/cart/cart.routes');\n" });
  assert.notEqual(r.code, 0, r.out);
});
