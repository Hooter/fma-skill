import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeFixture, TEMPLATES } from './helpers.mjs';

const mod = await import(pathToFileURL(path.join(TEMPLATES, 'arch-check.mjs')).href);

test('stripComments removes comments', () => {
  assert.equal(mod.stripComments('a // export * from "x"\n/* export * from "y" */b').includes('export'), false);
});

test('index.ts with explicit exports is clean', () => {
  const dir = makeFixture({ 'cart/index.ts': "export { A } from './a';\nexport type { B } from './b';\n" });
  assert.deepEqual(mod.barrelViolations(dir), []);
});

test('export * from is caught', () => {
  const dir = makeFixture({ 'cart/index.ts': "export * from './a';\n" });
  assert.equal(mod.barrelViolations(dir).length, 1);
});

test('export * as ns from is caught', () => {
  const dir = makeFixture({ 'cart/index.ts': "export * as cart from './a';\n" });
  assert.equal(mod.barrelViolations(dir).length, 1);
});

test('export * in a comment or in other files does not count', () => {
  const dir = makeFixture({
    'cart/index.ts': "// export * from './a'\nexport { A } from './a';\n",
    'cart/other.ts': "export * from './a';\n",
  });
  assert.deepEqual(mod.barrelViolations(dir), []);
});

test('node_modules and dist are skipped', () => {
  const dir = makeFixture({
    'node_modules/x/index.ts': "export * from './a';\n",
    'dist/index.ts': "export * from './a';\n",
  });
  assert.deepEqual(mod.barrelViolations(dir), []);
});

test('modulesWithoutIndex: a domain without index.ts is caught, shared and contracts are not', () => {
  const dir = makeFixture({
    'cart/index.ts': "export { A } from './a';\n",
    'cart/a.ts': 'export const A = 1;\n',
    'orders/orders.service.ts': 'export const o = 1;\n',
    'shared/util/index.ts': 'export const x = 1;\n',
    'contracts/y.ts': 'export const y = 1;\n',
    'main.ts': 'export {};\n',
  });
  assert.deepEqual(mod.modulesWithoutIndex(dir).map((p) => path.basename(p)), ['orders']);
});

test('modulesWithoutIndex: index.tsx counts too', () => {
  const dir = makeFixture({ 'ui/index.tsx': 'export const U = 1;\n' });
  assert.deepEqual(mod.modulesWithoutIndex(dir), []);
});

const violations = (src) => mod.barrelViolations(makeFixture({ 'm/index.ts': src })).length;

test('export type * and export type * as ns are caught', () => {
  assert.equal(violations("export type * from './a';\n"), 1);
  assert.equal(violations("export type * as t from './a';\n"), 1);
});

test('export * as "ns" (string name) and the multi-line form are caught', () => {
  assert.equal(violations("export * as 'ns' from './a';\n"), 1);
  assert.equal(violations("export *\n  from './a';\n"), 1);
});

test('a glob in a line comment does not swallow export *', () => {
  assert.equal(violations("// re-exports for apps/*/src\nexport * from './a';\n/** Cart API */\n"), 1);
});

test('export * inside a string or template is not a violation', () => {
  assert.equal(violations("export const doc = `export * from './a'`;\n"), 0);
  assert.equal(violations("export const s = \"export * from 'a'\";\n"), 0);
});

test('a URL in a string is not mistaken for a comment', () => {
  assert.equal(violations("export const u = 'http://x.y/z';\nexport * from './a';\n"), 1);
});

test('modulesWithoutIndex: a _submodule without index.ts is caught', () => {
  const dir = makeFixture({
    'cart/index.ts': "export { A } from './a';\n",
    'cart/_items/items.ts': 'export const I = 1;\n',
  });
  assert.deepEqual(mod.modulesWithoutIndex(dir).map((p) => path.basename(p)), ['_items']);
});

test('modulesWithoutIndex: a shared segment without index.ts is caught, contracts is not', () => {
  const dir = makeFixture({
    'shared/forms/form.ts': 'export const F = 1;\n',
    'shared/util/index.ts': 'export const U = 1;\n',
    'contracts/y.ts': 'export const y = 1;\n',
  });
  assert.deepEqual(mod.modulesWithoutIndex(dir).map((p) => path.basename(p)), ['forms']);
});
