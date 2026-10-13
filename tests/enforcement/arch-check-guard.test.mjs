import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, TEMPLATES, makeFixture } from './helpers.mjs';

const mod = await import(pathToFileURL(path.join(TEMPLATES, 'arch-check.mjs')).href);

test('typescriptProblem: TS 7 under the name typescript is a problem, with a hint about the alias', () => {
  const msg = mod.typescriptProblem('7.0.2');
  assert.ok(msg, 'a message was expected');
  assert.match(msg, /npm:@typescript\/typescript6/);
  assert.match(msg, /@typescript\/native/);
});

test('typescriptProblem: TS 5 and 6 are acceptable', () => {
  assert.equal(mod.typescriptProblem('6.0.3'), null);
  assert.equal(mod.typescriptProblem('5.9.3'), null);
});

test('parseCruisedModules: reads the module count from dependency-cruiser output', () => {
  assert.equal(mod.parseCruisedModules('✔ no dependency violations found (0 modules, 0 dependencies cruised)'), 0);
  assert.equal(mod.parseCruisedModules('✔ no dependency violations found (12 modules, 30 dependencies cruised)'), 12);
  assert.equal(mod.parseCruisedModules('something else'), null);
});

test('resolveTypeScriptVersion: version from the project node_modules, undefined if the package is missing', () => {
  assert.match(mod.resolveTypeScriptVersion(ROOT), /^\d+\.\d+\.\d+/);
  assert.equal(mod.resolveTypeScriptVersion(makeFixture({ 'a.txt': 'x' })), undefined);
});

test('arch-check fails if dependency-cruiser is "green" but processed 0 modules', () => {
  // The depcruise stub imitates an incompatible TypeScript: exit code 0 and "0 modules" in the output.
  const message = 'no dependency violations found (0 modules, 0 dependencies cruised)';
  const stub = makeFixture({
    'depcruise.cmd': `@echo off\r\necho ${message}\r\n`,
    depcruise: `#!/bin/sh\necho "${message}"\n`,
  });
  fs.chmodSync(path.join(stub, 'depcruise'), 0o755);
  const dir = makeFixture({ 'apps/api/src/cart/index.ts': 'export const A = 1;\n' });
  const env = {
    ...process.env,
    PATH: [stub, path.join(ROOT, 'node_modules/.bin'), process.env.PATH].join(path.delimiter),
  };
  const r = spawnSync(
    process.execPath,
    [
      path.join(TEMPLATES, 'arch-check.mjs'),
      '--api', path.join(dir, 'apps/api'),
      '--eslint-config', path.join(TEMPLATES, 'eslint.config.mjs'),
      '--depcruise-config', path.join(TEMPLATES, 'dependency-cruiser.cjs'),
    ],
    { cwd: dir, encoding: 'utf8', env },
  );
  const out = `${r.stdout}${r.stderr}`;
  assert.notEqual(r.status, 0, out);
  assert.match(out, /0 modules/);
});
