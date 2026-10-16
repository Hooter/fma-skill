import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, TEMPLATES, makeFixture } from './helpers.mjs';

const { importedNames, cycleArcs } = await import(pathToFileURL(path.join(TEMPLATES, 'arch-check.mjs')).href);

const tsconfig = JSON.stringify({
  compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler' },
});
const env = { ...process.env, PATH: `${path.join(ROOT, 'node_modules/.bin')}${path.delimiter}${process.env.PATH}` };

function archCheck(files, flags = []) {
  const dir = makeFixture({ 'svc/tsconfig.json': tsconfig, 'svc/package.json': '{}', ...files });
  const args = [
    path.join(TEMPLATES, 'arch-check.mjs'),
    '--api', path.join(dir, 'svc'),
    '--linter', 'oxlint',
    '--oxlint-config', path.join(TEMPLATES, 'oxlintrc.json'),
    '--depcruise-config', path.join(TEMPLATES, 'dependency-cruiser.cjs'),
    ...flags.map((f) => (f === '$JSON' ? path.join(dir, 'report.json') : f)),
  ];
  const r = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', env, shell: false });
  return { dir, code: r.status, out: `${r.stdout}${r.stderr}` };
}

const cycle = {
  'svc/src/products/index.ts': "export { P } from './product';\nexport type { MarkType } from './types';\n",
  'svc/src/products/product.ts': "import type { MarkType } from '../variants';\nexport class P { m?: MarkType; }\n",
  'svc/src/products/types.ts': "export type MarkType = 'a' | 'b';\n",
  'svc/src/variants/index.ts': "export { V } from './variant';\n",
  'svc/src/variants/variant.ts': "import type { MarkType } from '../products';\nexport class V { m?: MarkType; }\n",
};

test('importedNames lists the names of the statement with the given specifier', () => {
  const text = "import { A, type B as C } from '../x';\nimport D from '../y';\nexport { E } from '../x';\n";
  assert.deepEqual(importedNames(text, '../x'), ['A', 'B', 'E']);
  assert.deepEqual(importedNames(text, '../y'), ['D']);
});

test('cycleArcs reports each cycle once with the kind and names of every arc', () => {
  const report = {
    modules: [
      { source: 'a/index.ts', dependencies: [{ resolved: 'b/index.ts', module: '../b' }] },
      { source: 'b/index.ts', dependencies: [{ resolved: 'a/index.ts', module: '../a' }] },
    ],
    summary: {
      violations: [
        {
          type: 'cycle', from: 'a/index.ts', to: 'b/index.ts', unresolvedTo: '../b', rule: { name: 'no-circular' },
          cycle: [{ name: 'b/index.ts', dependencyTypes: ['local', 'import'] }, { name: 'a/index.ts', dependencyTypes: ['local', 'type-only', 'import'] }],
        },
        {
          type: 'cycle', from: 'b/index.ts', to: 'a/index.ts', unresolvedTo: '../a', rule: { name: 'no-circular' },
          cycle: [{ name: 'a/index.ts', dependencyTypes: ['local', 'type-only', 'import'] }, { name: 'b/index.ts', dependencyTypes: ['local', 'import'] }],
        },
      ],
    },
  };
  const files = { 'a/index.ts': "import { B } from '../b';\n", 'b/index.ts': "import type { A } from '../a';\n" };
  const cycles = cycleArcs(report, (f) => files[f]);
  assert.equal(cycles.length, 1);
  assert.deepEqual(cycles[0].arcs.map((a) => [a.kind, a.names]), [['value', ['B']], ['type', ['A']]]);
});

test('the no-circular report shows what travels along the cycle', () => {
  const r = archCheck(cycle);
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /cycle \(no-circular\)/);
  assert.match(r.out, /\[type\]\s+MarkType/);
});

test('--json writes violations and counts per rule', () => {
  const r = archCheck(cycle, ['--report', '--json', '$JSON']);
  assert.equal(r.code, 0, r.out);
  const report = JSON.parse(fs.readFileSync(path.join(r.dir, 'report.json'), 'utf8'));
  assert.ok(report.total > 0);
  assert.ok(report.targets[0].counts['no-circular'] > 0);
  assert.ok(report.targets[0].violations.every((v) => v.rule && v.from));
});

test('--json of a clean project has total 0', () => {
  const r = archCheck(
    { 'svc/src/cart/index.ts': "export const C = 1;\n" },
    ['--json', '$JSON'],
  );
  assert.equal(r.code, 0, r.out);
  assert.equal(JSON.parse(fs.readFileSync(path.join(r.dir, 'report.json'), 'utf8')).total, 0);
});
