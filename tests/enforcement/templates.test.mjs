import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATES, binPath, makeFixture, run } from './helpers.mjs';

const read = (name) => fs.readFileSync(path.join(TEMPLATES, name), 'utf8');

// --- oxfmt (fast profile)
const OXFMT = binPath('oxfmt');
const oxfmtCheck = (file, content) => {
  const dir = makeFixture({ '.oxfmtrc.json': read('oxfmtrc.json'), [file]: content });
  return run(OXFMT, ['--check', file], dir);
};

test('oxfmt: a formatted file passes', () => {
  const r = oxfmtCheck('a.ts', "export const a = 'x';\n");
  assert.equal(r.code, 0, r.out);
});

test('oxfmt: double quotes fail (singleQuote from the config), without the config they pass', () => {
  const src = 'export const a = "x";\n';
  assert.notEqual(oxfmtCheck('a.ts', src).code, 0);
  assert.equal(run(OXFMT, ['--check', 'a.ts'], makeFixture({ 'a.ts': src })).code, 0);
});

// --- Prettier (baseline profile)
const PRETTIER = binPath('prettier');
const prettierCheck = (file, content) => {
  const dir = makeFixture({ '.prettierrc': read('prettierrc.json'), [file]: content });
  return run(PRETTIER, ['--check', file], dir);
};

test('prettier: formatted TypeScript passes', () => {
  const r = prettierCheck('a.ts', "export const a = 'x';\n");
  assert.equal(r.code, 0, r.out);
});

test('prettier: double quotes fail (singleQuote from the config), without the config they pass', () => {
  const src = 'export const a = "x";\n';
  assert.notEqual(prettierCheck('a.ts', src).code, 0);
  assert.equal(run(PRETTIER, ['--no-config', '--check', 'a.ts'], makeFixture({ 'a.ts': src })).code, 0);
});

test('prettier: Angular templates are formatted by the angular parser (@if blocks get indentation)', () => {
  const formatted = '@if (ok) {\n  <span>yes</span>\n}\n';
  assert.equal(prettierCheck('a.html', formatted).code, 0);
  assert.notEqual(prettierCheck('a.html', '@if (ok) {<span>yes</span>}\n').code, 0);
});

// --- pre-commit hook: two profiles
function checkHook(file, tools) {
  const y = read(file);
  const order = ['\n    format:', '\n    lint:', '\n    arch:'].map((k) => y.indexOf(k));
  assert.ok(order.every((i) => i >= 0), `${file}: one of the format/lint/arch commands is missing`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, `${file}: order is format, lint, arch`);
  assert.match(y, tools.format);
  assert.match(y, tools.lint);
  assert.match(y, /stage_fixed: true/);
  assert.match(y, /arch:check/);
}

test('lefthook.yml (baseline profile): prettier, eslint, arch:check', () => {
  checkHook('lefthook.yml', {
    format: /prettier --write \{staged_files\}/,
    lint: /eslint .*\{staged_files\}/,
  });
});

test('lefthook.fast.yml (fast profile): oxfmt, oxlint, arch:check', () => {
  checkHook('lefthook.fast.yml', {
    format: /oxfmt \{staged_files\}/,
    lint: /oxlint .*\{staged_files\}/,
  });
});

// The templates are copied into projects that use Prettier: they must pass prettier --check with their own config.
test('prettier: executable templates (js, mjs, cjs, ts, json) are formatted', () => {
  const files = fs
    .readdirSync(TEMPLATES)
    .filter((f) => /\.(mjs|cjs|ts|json)$/.test(f) && f !== 'prettierrc.json');
  const dir = makeFixture({
    '.prettierrc': read('prettierrc.json'),
    ...Object.fromEntries(files.map((f) => [f, read(f)])),
  });
  const r = run(PRETTIER, ['--check', ...files], dir);
  assert.equal(r.code, 0, r.out);
});
