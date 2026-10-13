import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { TEMPLATES, binPath, makeFixture, run } from './helpers.mjs';

const DEPCRUISE = binPath('dependency-cruiser', 'depcruise');
const CONFIG = path.join(TEMPLATES, 'dependency-cruiser.cjs');
const tsconfig = JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler' } });
const cruise = (files) =>
  run(DEPCRUISE, ['src', '--config', CONFIG], makeFixture({ 'tsconfig.json': tsconfig, ...files }));

const cartBase = {
  'src/cart/index.ts': "export { CartService } from './cart.service';\n",
  'src/cart/cart.service.ts': 'export class CartService {}\n',
};

test('importing a neighbor through index.ts is allowed', () => {
  const r = cruise({
    ...cartBase,
    'src/orders/orders.service.ts': "import { CartService } from '../cart';\nexport const o = CartService;\n",
  });
  assert.equal(r.code, 0, r.out);
});

test('importing an internal file of a neighbor is forbidden', () => {
  const r = cruise({
    ...cartBase,
    'src/orders/orders.service.ts': "import { CartService } from '../cart/cart.service';\nexport const o = CartService;\n",
  });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /no-deep-import/);
});

test('a neighbor cannot import a _submodule of another domain, the parent can import its own', () => {
  const files = {
    ...cartBase,
    'src/cart/_items/items.service.ts': 'export class ItemsService {}\n',
    'src/cart/cart.module.ts': "import { ItemsService } from './_items/items.service';\nexport const m = ItemsService;\n",
  };
  assert.equal(cruise(files).code, 0);
  const bad = cruise({
    ...files,
    'src/orders/orders.service.ts': "import { ItemsService } from '../cart/_items/items.service';\nexport const o = ItemsService;\n",
  });
  assert.notEqual(bad.code, 0, bad.out);
  assert.match(bad.out, /no-deep-import/);
});

test('shared and contracts are not domains: importing from shared is allowed', () => {
  const r = cruise({
    ...cartBase,
    'src/shared/util/index.ts': 'export const slug = (s: string) => s;\n',
    'src/cart/cart.helper.ts': "import { slug } from '../shared/util';\nexport const h = slug;\n",
  });
  assert.equal(r.code, 0, r.out);
});

test('a cycle between modules is forbidden', () => {
  const r = cruise({
    'src/a/index.ts': "export { b } from '../b';\nexport const a = 1;\n",
    'src/b/index.ts': "import { a } from '../a';\nexport const b = a;\n",
  });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /no-circular/);
});

test('domain does not import a framework', () => {
  const r = cruise({
    'src/cart/index.ts': "export { Cart } from './domain/cart';\n",
    'src/cart/domain/cart.ts': "import { Injectable } from '@nestjs/common';\nexport const Cart = Injectable;\n",
  });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /domain-pure/);
});

test('ui does not import api, model, repository (item 4)', () => {
  const base = {
    'src/cart/index.ts': "export { CartApi } from './cart.api';\n",
    'src/cart/cart.api.ts': 'export class CartApi {}\n',
  };
  const bad = cruise({
    ...base,
    'src/cart/ui/badge.ts': "import { CartApi } from '../cart.api';\nexport const b = CartApi;\n",
  });
  assert.notEqual(bad.code, 0, bad.out);
  assert.match(bad.out, /ui-no-data/);
  const ok = cruise({
    ...base,
    'src/cart/cart.state.ts': "import { CartApi } from './cart.api';\nexport const s = CartApi;\n",
    'src/cart/ui/badge.ts': "import { s } from '../cart.state';\nexport const b = s;\n",
  });
  assert.equal(ok.code, 0, ok.out);
});

test('api, model, repo do not import ui or state (item 5)', () => {
  const r = cruise({
    'src/cart/index.ts': "export { CartModel } from './cart.model';\n",
    'src/cart/cart.state.ts': 'export class CartState {}\n',
    'src/cart/cart.model.ts': "import { CartState } from './cart.state';\nexport const CartModel = CartState;\n",
  });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /lower-no-ui/);
});

test('domain does not import shared/ui or shared/data (item 6) but may import shared/util', () => {
  const dom = {
    'src/cart/index.ts': "export { Cart } from './domain/cart';\n",
    'src/shared/ui/index.ts': 'export const Button = 1;\n',
    'src/shared/util/index.ts': 'export const slug = 1;\n',
  };
  const bad = cruise({ ...dom, 'src/cart/domain/cart.ts': "import { Button } from '../../shared/ui';\nexport const Cart = Button;\n" });
  assert.notEqual(bad.code, 0, bad.out);
  assert.match(bad.out, /domain-isolated/);
  const ok = cruise({ ...dom, 'src/cart/domain/cart.ts': "import { slug } from '../../shared/util';\nexport const Cart = slug;\n" });
  assert.equal(ok.code, 0, ok.out);
});

test('FMA_SRC_ROOT=src/app moves the rules to the Angular layout', () => {
  const files = {
    'tsconfig.json': tsconfig,
    'src/app/cart/index.ts': "export { CartApi } from './cart.api';\n",
    'src/app/cart/cart.api.ts': 'export class CartApi {}\n',
    'src/app/orders/orders.state.ts': "import { CartApi } from '../cart/cart.api';\nexport const o = CartApi;\n",
  };
  const dir = makeFixture(files);
  const r = run(DEPCRUISE, ['src', '--config', CONFIG], dir, { FMA_SRC_ROOT: 'src/app' });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /no-deep-import/);
});

test('rich module (has a domain/, even an empty one): service does not import repository', () => {
  const body = {
    'src/cart/index.ts': "export { CartService } from './cart.service';\n",
    'src/cart/cart.repository.ts': 'export class CartRepository {}\n',
    'src/cart/cart.service.ts': "import { CartRepository } from './cart.repository';\nexport class CartService { r = CartRepository; }\n",
  };
  const rich = cruise({ ...body, 'src/cart/domain/.gitkeep': '' });
  assert.notEqual(rich.code, 0, rich.out);
  assert.match(rich.out, /rich-model-no-repo:cart/);
  const simple = cruise(body);
  assert.equal(simple.code, 0, simple.out);
});
