import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEMPLATES, makeFixture } from './helpers.mjs';

const { proposeMoves } = await import(pathToFileURL(path.join(TEMPLATES, 'fsd-to-fma.mjs')).href);

test('slices become domains, same-named slices are flagged, shared segments are renamed', () => {
  const dir = makeFixture({
    'src/entities/cart/model/cart.ts': 'export const c = 1;\n',
    'src/features/cart/ui/button.ts': 'export const b = 1;\n',
    'src/features/checkout/index.ts': 'export const k = 1;\n',
    'src/pages/home/ui/home.ts': 'export const h = 1;\n',
    'src/shared/lib/slug.ts': 'export const s = 1;\n',
    'src/shared/ui/index.ts': 'export const u = 1;\n',
    'src/app/main.ts': 'export const m = 1;\n',
  });
  const r = proposeMoves(path.join(dir, 'src'));
  assert.equal(r.moves['src/entities/cart/'], 'src/cart/');
  assert.equal(r.moves['src/features/cart/'], 'src/cart-features/');
  assert.equal(r.moves['src/features/checkout/'], 'src/checkout/');
  assert.equal(r.moves['src/pages/home/'], 'src/home/');
  assert.equal(r.moves['src/shared/lib/'], 'src/shared/util/');
  assert.equal(r.moves['src/shared/ui/'], undefined);
  assert.deepEqual(r.merge.map((m) => m.slice), ['features/cart']);
});
