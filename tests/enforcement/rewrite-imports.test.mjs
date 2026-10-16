import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEMPLATES, makeFixture } from './helpers.mjs';

const { applyMoves } = await import(pathToFileURL(path.join(TEMPLATES, 'rewrite-imports.mjs')).href);
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

test('a moved file and its importers get new relative specifiers; CRLF is preserved', () => {
  const dir = makeFixture({
    'src/cart/cart.service.ts': "import { Money } from '../shared/money';\r\nexport const c = Money;\r\n",
    'src/shared/money.ts': 'export const Money = 1;\r\n',
    'src/orders/orders.service.ts': "import { c } from '../cart/cart.service';\nexport const o = c;\n",
  });
  const r = applyMoves(dir, { moves: { 'src/cart/cart.service.ts': 'src/billing/cart/cart.service.ts' } });
  assert.equal(r.moved, 1);
  assert.ok(!fs.existsSync(path.join(dir, 'src/cart/cart.service.ts')));
  assert.equal(
    read(dir, 'src/billing/cart/cart.service.ts'),
    "import { Money } from '../../shared/money';\r\nexport const c = Money;\r\n",
  );
  assert.equal(
    read(dir, 'src/orders/orders.service.ts'),
    "import { c } from '../billing/cart/cart.service';\nexport const o = c;\n",
  );
});

test('a folder move keeps index style and rewrites aliases', () => {
  const dir = makeFixture({
    'src/legacy/index.ts': "export { A } from './a';\n",
    'src/legacy/a.ts': 'export const A = 1;\n',
    'src/orders/o.ts':
      "import { A } from '../legacy';\nimport { A as B } from '@app/legacy';\nimport x from 'rxjs';\nexport const o = [A, B, x];\n",
  });
  applyMoves(dir, { moves: { 'src/legacy/': 'src/billing/' }, aliases: { '@app/': 'src/' } });
  assert.equal(
    read(dir, 'src/orders/o.ts'),
    "import { A } from '../billing';\nimport { A as B } from '@app/billing';\nimport x from 'rxjs';\nexport const o = [A, B, x];\n",
  );
  assert.equal(read(dir, 'src/billing/index.ts'), "export { A } from './a';\n");
});

test('--dry-run changes nothing', () => {
  const dir = makeFixture({
    'src/a.ts': 'export const a = 1;\n',
    'src/b.ts': "import { a } from './a';\nexport const b = a;\n",
  });
  applyMoves(dir, { moves: { 'src/a.ts': 'src/x/a.ts' } }, { dryRun: true });
  assert.ok(fs.existsSync(path.join(dir, 'src/a.ts')));
  assert.equal(read(dir, 'src/b.ts'), "import { a } from './a';\nexport const b = a;\n");
});
