import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeCase } from './grade-evals.mjs';

const expect = { mentions: ['index.ts', 'Facade'], forbid: ['export *'], runsArchCheck: true };

test('an answer with the required words and without forbidden ones passes', () => {
  const r = gradeCase('Import only through index.ts, call through CartFacade; running arch:check', expect);
  assert.deepEqual(r, { missing: [], forbidden: [], archCheck: true, pass: true });
});

test('mentions are compared case-insensitively', () => {
  assert.deepEqual(gradeCase('INDEX.TS and facade, arch:check', expect).missing, []);
});

test('missing words, forbidden phrases and a missing arch:check fail', () => {
  const r = gradeCase('Use export * from the root', expect);
  assert.deepEqual(r.missing, ['index.ts', 'Facade']);
  assert.deepEqual(r.forbidden, ['export *']);
  assert.equal(r.archCheck, false);
  assert.equal(r.pass, false);
});

test('runsArchCheck=false does not require mentioning arch:check', () => {
  const r = gradeCase('index.ts and Facade', { ...expect, forbid: [], runsArchCheck: false });
  assert.equal(r.pass, true);
});

test('a forbidden phrase on a line with a negation (explaining the ban) is not a violation', () => {
  const exp = { mentions: [], forbid: ['export *', 'domain/'], runsArchCheck: false };
  assert.deepEqual(gradeCase('index.ts: named exports only, without export *\nI do not create domain/ (simple tier)', exp).forbidden, []);
  assert.deepEqual(gradeCase('Never write export * in index.ts', exp).forbidden, []);
  assert.deepEqual(gradeCase('export * from "./a";', exp).forbidden, ['export *']);
});

test('"No export *" is a negation too', () => {
  const exp = { mentions: [], forbid: ['export *'], runsArchCheck: false };
  assert.deepEqual(gradeCase('No `export *`. This is checklist item 2.', exp).forbidden, []);
});
