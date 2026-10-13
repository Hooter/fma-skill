import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { TEMPLATES, binPath, makeFixture, run } from './helpers.mjs';

const OXLINT = binPath('oxlint');
const CONFIG = path.join(TEMPLATES, 'oxlintrc.json');
const lint = (files) => run(OXLINT, ['-c', CONFIG, '.'], makeFixture(files));

test('clean code passes', () => {
  const r = lint({
    'a.ts': "import { b } from './b';\nexport const a = b + 1;\n",
    'b.ts': 'export const b = 1;\n',
  });
  assert.equal(r.code, 0, r.out);
});

test('a cycle a <-> b is forbidden (import/no-cycle)', () => {
  const r = lint({
    'a.ts': "import { b } from './b';\nexport const a = b;\n",
    'b.ts': "import { a } from './a';\nexport const b = a;\n",
  });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /no-cycle/);
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
