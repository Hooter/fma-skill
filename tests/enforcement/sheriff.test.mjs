import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATES, binPath, makeFixture, run } from './helpers.mjs';

const SHERIFF = binPath('@softarc/sheriff-core', 'sheriff');
const config = fs.readFileSync(path.join(TEMPLATES, 'sheriff.config.ts'), 'utf8');
const tsconfig = JSON.stringify({
  compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', baseUrl: '.' },
});
const verify = (files) =>
  run(SHERIFF, ['verify', 'src/main.ts'], makeFixture({ 'tsconfig.json': tsconfig, 'sheriff.config.ts': config, ...files }));

const base = {
  'src/app/cart/index.ts': "export { CartState } from './cart.state';\n",
  'src/app/cart/cart.state.ts': 'export class CartState {}\n',
  'src/app/orders/index.ts': "export { OrdersState } from './orders.state';\n",
};

test('importing a neighbor through index.ts is allowed', () => {
  const r = verify({
    ...base,
    'src/main.ts': "import { CartState } from './app/cart';\nexport const c = CartState;\n",
    'src/app/orders/orders.state.ts': "import { CartState } from '../cart';\nexport class OrdersState { c = CartState; }\n",
  });
  assert.equal(r.code, 0, r.out);
});

test('importing an internal file of a neighbor is forbidden', () => {
  const r = verify({
    ...base,
    'src/main.ts': "import { OrdersState } from './app/orders';\nexport const o = OrdersState;\n",
    'src/app/orders/orders.state.ts':
      "import { CartState } from '../cart/cart.state';\nexport class OrdersState { c = CartState; }\n",
  });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /Encapsulation/);
});

test('domain/ cannot import ui', () => {
  const r = verify({
    ...base,
    'src/main.ts': "import { CartState } from './app/cart';\nexport const c = CartState;\n",
    'src/app/cart/index.ts': "export { CartState } from './cart.state';\nexport { Cart } from './domain';\n",
    'src/app/shared/ui/index.ts': 'export const Button = 1;\n',
    'src/app/cart/domain/index.ts': "export { Cart } from './cart';\n",
    'src/app/cart/domain/cart.ts': "import { Button } from '../../shared/ui';\nexport const Cart = Button;\n",
  });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /layer:domain to tags kind:ui/);
});

test('rich domain: domain/ with pure utilities passes', () => {
  const r = verify({
    ...base,
    'src/main.ts': "import { Cart } from './app/cart';\nexport const c = Cart;\n",
    'src/app/cart/index.ts': "export { CartState } from './cart.state';\nexport { Cart } from './domain';\n",
    'src/app/shared/util/index.ts': 'export const slug = 1;\n',
    'src/app/cart/domain/index.ts': "export { Cart } from './cart';\n",
    'src/app/cart/domain/cart.ts': "import { slug } from '../../shared/util';\nexport const Cart = slug;\n",
  });
  assert.equal(r.code, 0, r.out);
});

test('a _items submodule with index.ts: the parent imports it through index.ts', () => {
  const r = verify({
    'src/main.ts': "import { CartState } from './app/cart';\nexport const c = CartState;\n",
    'src/app/cart/index.ts': "export { CartState } from './cart.state';\n",
    'src/app/cart/cart.state.ts': "import { Items } from './_items';\nexport class CartState { i = Items; }\n",
    'src/app/cart/_items/index.ts': "export const Items = 1;\n",
  });
  assert.equal(r.code, 0, r.out);
});

test('an arbitrary shared segment (forms) with index.ts is available to a domain', () => {
  const r = verify({
    'src/main.ts': "import { CartState } from './app/cart';\nexport const c = CartState;\n",
    'src/app/cart/index.ts': "export { CartState } from './cart.state';\n",
    'src/app/cart/cart.state.ts': "import { Form } from '../shared/forms';\nexport class CartState { f = Form; }\n",
    'src/app/shared/forms/index.ts': 'export const Form = 1;\n',
  });
  assert.equal(r.code, 0, r.out);
});

test('a neighbor cannot reach into the internals of a submodule of another domain', () => {
  const r = verify({
    'src/main.ts': "import { OrdersState } from './app/orders';\nexport const o = OrdersState;\n",
    'src/app/cart/index.ts': "export { Items } from './_items';\n",
    'src/app/cart/_items/index.ts': "export { Items } from './items';\n",
    'src/app/cart/_items/items.ts': 'export const Items = 1;\n',
    'src/app/orders/index.ts': "export { OrdersState } from './orders.state';\n",
    'src/app/orders/orders.state.ts': "import { Items } from '../cart/_items/items';\nexport class OrdersState { i = Items; }\n",
  });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /Encapsulation/);
});

test('a deep import into a shared segment is forbidden (shared/ui/button)', () => {
  const r = verify({
    'src/main.ts': "import { CartState } from './app/cart';\nexport const c = CartState;\n",
    'src/app/cart/index.ts': "export { CartState } from './cart.state';\n",
    'src/app/cart/cart.state.ts': "import { Button } from '../shared/ui/button';\nexport class CartState { b = Button; }\n",
    'src/app/shared/ui/index.ts': "export { Button } from './button';\n",
    'src/app/shared/ui/button.ts': 'export const Button = 1;\n',
  });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /Encapsulation/);
});

test('a domain imports contracts from libs/contracts through index.ts', () => {
  const r = verify({
    'src/main.ts': "import { CartState } from './app/cart';\nexport const c = CartState;\n",
    'src/app/cart/index.ts': "export { CartState } from './cart.state';\n",
    'src/app/cart/cart.state.ts': "import { Cart } from '../../../libs/contracts/src/cart';\nexport class CartState { c = Cart; }\n",
    'libs/contracts/src/cart/index.ts': "export const Cart = 1;\n",
  });
  assert.equal(r.code, 0, r.out);
});

test('contracts cannot import domains', () => {
  const r = verify({
    'src/main.ts': "import { CartState } from './app/cart';\nexport const c = CartState;\n",
    'src/app/cart/index.ts': "export { CartState } from './cart.state';\n",
    'src/app/cart/cart.state.ts': "import { Cart } from '../../../libs/contracts/src/cart';\nexport class CartState { c = Cart; }\n",
    'libs/contracts/src/cart/index.ts': "import { Other } from '../../../../src/app/other';\nexport const Cart = Other;\n",
    'src/app/other/index.ts': 'export const Other = 1;\n',
  });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /kind:contracts to tags domain:other/);
});
