import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEvals } from './validate-evals.mjs';

const mk = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `case-${i}`,
    prompt: 'create a domain',
    expect: { mentions: ['index.ts'], forbid: ['export *'], runsArchCheck: false },
  }));

test('5 valid cases pass', () => {
  assert.deepEqual(checkEvals('angular', mk(5)), []);
});

test('fewer than 5 cases is an error', () => {
  assert.ok(checkEvals('nestjs', mk(4)).some((e) => e.includes('5')));
});

test('duplicate ids and missing fields are errors', () => {
  const cases = mk(5);
  cases[1].id = cases[0].id;
  delete cases[2].expect.mentions;
  const errs = checkEvals('angular', cases);
  assert.ok(errs.some((e) => e.includes('duplicate')));
  assert.ok(errs.some((e) => e.includes('mentions')));
});

test('a non-array is an error', () => {
  assert.equal(checkEvals('angular', {}).length, 1);
});
