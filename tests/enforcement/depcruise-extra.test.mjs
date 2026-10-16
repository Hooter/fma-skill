import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { TEMPLATES, binPath, makeFixture, run } from './helpers.mjs';

const DEPCRUISE = binPath('dependency-cruiser', 'depcruise');
const CONFIG = path.join(TEMPLATES, 'dependency-cruiser.cjs');
const tsconfig = JSON.stringify({
  compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', baseUrl: '.', paths: { '@app/*': ['src/*'], '@shared/*': ['src/shared/*'] } },
});
const cruise = (files) => run(DEPCRUISE, ['src', '--config', CONFIG], makeFixture({ 'tsconfig.json': tsconfig, ...files }));
const expectRule = (files, rule) => {
  const r = cruise(files);
  assert.notEqual(r.code, 0, `${rule}: a violation was expected\n${r.out}`);
  assert.match(r.out, new RegExp(rule));
};

const cart = {
  'src/cart/index.ts': "export { CartState } from './cart.state';\n",
  'src/cart/cart.state.ts': 'export class CartState {}\n',
};

test('a public submodule of a neighbor is closed just like an internal one (visible only through the index of its parent)', () => {
  for (const sub of ['_items', 'reviews']) {
    expectRule(
      {
        ...cart,
        [`src/cart/${sub}/x.ts`]: 'export const X = 1;\n',
        'src/orders/o.ts': `import { X } from '../cart/${sub}/x';\nexport const o = X;\n`,
      },
      'no-deep-import',
    );
  }
});

test('child → parent is forbidden', () => {
  expectRule(
    {
      ...cart,
      'src/cart/cart.service.ts': 'export class CartService {}\n',
      'src/cart/_items/items.service.ts': "import { CartService } from '../cart.service';\nexport const i = CartService;\n",
    },
    'child-no-parent',
  );
});

test('submodules of one domain are isolated from each other (only through index)', () => {
  const base = { ...cart, 'src/cart/_b/index.ts': "export { B } from './b';\n", 'src/cart/_b/b.ts': 'export const B = 1;\n' };
  expectRule({ ...base, 'src/cart/_a/a.ts': "import { B } from '../_b/b';\nexport const a = B;\n" }, 'sibling-sub-deep');
  const ok = cruise({ ...base, 'src/cart/_a/a.ts': "import { B } from '../_b';\nexport const a = B;\n" });
  assert.equal(ok.code, 0, ok.out);
});

test('page → api is forbidden (page is the ui layer)', () => {
  expectRule(
    {
      ...cart,
      'src/cart/cart.api.ts': 'export class CartApi {}\n',
      'src/cart/cart.page.ts': "import { CartApi } from './cart.api';\nexport const p = CartApi;\n",
    },
    'ui-no-data',
  );
});

test('ui is checked at any submodule depth', () => {
  expectRule(
    {
      ...cart,
      'src/cart/cart.api.ts': 'export class CartApi {}\n',
      'src/cart/_a/_b/ui/x.ts': "import { CartApi } from '../../../cart.api';\nexport const x = CartApi;\n",
    },
    'ui-no-data',
  );
});

test('ui → shared/data is forbidden (shared/data is the repo layer in Angular)', () => {
  expectRule(
    {
      ...cart,
      'src/shared/data/index.ts': 'export const Http = 1;\n',
      'src/cart/ui/x.ts': "import { Http } from '../../shared/data';\nexport const x = Http;\n",
    },
    'ui-no-data',
  );
});

test('state → ui and service → controller are forbidden; resolver → state is forbidden', () => {
  expectRule(
    { ...cart, 'src/cart/ui/badge.ts': 'export const B = 1;\n', 'src/cart/cart.state.ts': "import { B } from './ui/badge';\nexport class CartState { b = B; }\n" },
    'state-no-ui',
  );
  expectRule(
    {
      ...cart,
      'src/cart/cart.controller.ts': 'export class CartController {}\n',
      'src/cart/cart.service.ts': "import { CartController } from './cart.controller';\nexport class CartService { c = CartController; }\n",
    },
    'service-no-controller',
  );
  expectRule(
    {
      ...cart,
      'src/cart/cart.resolver.ts': "import { CartState } from './cart.state';\nexport const r = CartState;\n",
    },
    'lower-no-ui',
  );
});

test('domain-pure also applies inside a submodule (_pricing/domain)', () => {
  expectRule(
    {
      ...cart,
      'src/cart/_pricing/domain/price.ts': "import { Injectable } from '@nestjs/common';\nexport const P = Injectable;\n",
    },
    'domain-pure',
  );
});

test('domain imports only its own domain/ and shared/util', () => {
  expectRule(
    {
      ...cart,
      'src/shared/guards/index.ts': 'export const G = 1;\n',
      'src/cart/domain/x.ts': "import { G } from '../../shared/guards';\nexport const x = G;\n",
    },
    'domain-isolated',
  );
  expectRule(
    {
      ...cart,
      'src/orders/index.ts': 'export const O = 1;\n',
      'src/cart/domain/x.ts': "import { O } from '../../orders';\nexport const x = O;\n",
    },
    'domain-isolated',
  );
  expectRule(
    {
      ...cart,
      'src/cart/cart.repository.ts': 'export class CartRepository {}\n',
      'src/cart/domain/x.ts': "import { CartRepository } from '../cart.repository';\nexport const x = CartRepository;\n",
    },
    'domain-isolated',
  );
});

test('rich: a repository in a subfolder and the ORM used directly are forbidden for service', () => {
  const rich = { ...cart, 'src/cart/domain/.gitkeep': '' };
  expectRule(
    {
      ...rich,
      'src/cart/infra/cart.repository.ts': 'export class CartRepository {}\n',
      'src/cart/cart.service.ts': "import { CartRepository } from './infra/cart.repository';\nexport class CartService { r = CartRepository; }\n",
    },
    'rich-model-no-repo:cart',
  );
  expectRule(
    {
      ...rich,
      'src/cart/cart.service.ts': "import { Repository } from 'typeorm';\nexport class CartService { r = Repository; }\n",
    },
    'rich-model-no-orm:cart',
  );
  const simple = cruise({
    ...cart,
    'src/cart/cart.service.ts': "import { Repository } from 'typeorm';\nexport class CartService { r = Repository; }\n",
  });
  assert.equal(simple.code, 0, simple.out);
});

test('a rich submodule (_items/domain) gets its own rules', () => {
  expectRule(
    {
      ...cart,
      'src/cart/_items/domain/.gitkeep': '',
      'src/cart/_items/items.repository.ts': 'export class ItemsRepository {}\n',
      'src/cart/_items/items.service.ts': "import { ItemsRepository } from './items.repository';\nexport class ItemsService { r = ItemsRepository; }\n",
    },
    'rich-model-no-repo:cart/_items',
  );
});

test('tsconfig paths aliases are resolved: a cycle through @app/* is caught', () => {
  expectRule(
    {
      'src/a/index.ts': "import { b } from '@app/b';\nexport const a = b;\n",
      'src/b/index.ts': "import { a } from '@app/a';\nexport const b = a;\n",
    },
    'no-circular',
  );
});

test('alias: a deep import of a neighbor through @app/* is caught by depcruise', () => {
  expectRule(
    {
      ...cart,
      'src/orders/o.ts': "import { CartState } from '@app/cart/cart.state';\nexport const o = CartState;\n",
    },
    'no-deep-import',
  );
});

test('shared does not import domains; a domain does not reach deep into a shared segment', () => {
  expectRule(
    {
      ...cart,
      'src/shared/util/index.ts': "import { CartState } from '../../cart/cart.state';\nexport const u = CartState;\n",
    },
    'shared-no-domain',
  );
  expectRule(
    {
      ...cart,
      'src/shared/util/index.ts': "export { slug } from './slug';\n",
      'src/shared/util/slug.ts': 'export const slug = 1;\n',
      'src/cart/helper.ts': "import { slug } from '../shared/util/slug';\nexport const h = slug;\n",
    },
    'no-deep-shared',
  );
});

test('Nest: a neighbor module is wired through index.ts (Module + Facade) without violations', () => {
  const r = cruise({
    'src/cart/index.ts': "export { CartModule } from './cart.module';\nexport { CartFacade } from './cart.facade';\n",
    'src/cart/cart.module.ts': "import { CartFacade } from './cart.facade';\nexport class CartModule { f = CartFacade; }\n",
    'src/cart/cart.facade.ts': 'export class CartFacade {}\n',
    'src/orders/orders.module.ts': "import { CartModule, CartFacade } from '@app/cart';\nexport class OrdersModule { m = CartModule; f = CartFacade; }\n",
  });
  assert.equal(r.code, 0, r.out);
});

test('infrastructure port in shared/events: the domain and the shared/outbox adapter work without violations', () => {
  const r = cruise({
    'src/shared/events/index.ts': "export { EventPublisher } from './event-publisher.port';\n",
    'src/shared/events/event-publisher.port.ts': 'export abstract class EventPublisher {}\n',
    'src/shared/outbox/index.ts': "export { OutboxEventPublisher } from './outbox-event-publisher';\n",
    'src/shared/outbox/outbox-event-publisher.ts': "import { EventPublisher } from '../events';\nexport class OutboxEventPublisher extends EventPublisher {}\n",
    'src/cart/index.ts': "export { CartService } from './cart.service';\n",
    'src/cart/cart.service.ts': "import { EventPublisher } from '../shared/events';\nexport class CartService { e = EventPublisher; }\n",
  });
  assert.equal(r.code, 0, r.out);
});

test('a domain port cannot be implemented by an adapter from shared (shared-no-domain)', () => {
  expectRule(
    {
      'src/cart/index.ts': "export { CartRepositoryPort } from './ports/cart-repository.port';\n",
      'src/cart/ports/cart-repository.port.ts': 'export abstract class CartRepositoryPort {}\n',
      'src/shared/infra/index.ts': "export { Impl } from './impl';\n",
      'src/shared/infra/impl.ts': "import { CartRepositoryPort } from '../../cart';\nexport class Impl extends CartRepositoryPort {}\n",
    },
    'shared-no-domain',
  );
});

test('a dynamic import() deep into a neighbor is caught by depcruise (a safety net for oxlint)', () => {
  expectRule(
    {
      ...cart,
      'src/orders/o.ts': "export const load = () => import('@app/cart/cart.state');\n",
    },
    'no-deep-import',
  );
});

// Angular naming (FMA_APP=web): the role is the end of the file name, component folders have no index.ts.
const cruiseWeb = (files) =>
  run(DEPCRUISE, ['src', '--config', CONFIG], makeFixture({ 'tsconfig.json': tsconfig, ...files }), { FMA_APP: 'web' });
const webCart = {
  'src/cart/index.ts': "export { CartApi } from './cart-api';\n",
  'src/cart/cart-api.ts': 'export class CartApi {}\n',
  'src/cart/cart-state.ts': "import { CartApi } from './cart-api';\nexport class CartState { a = CartApi; }\n",
};

test('Angular naming: a component in a subject folder may use state but not api (ui-no-data)', () => {
  const ok = cruiseWeb({
    ...webCart,
    'src/cart/cart-badge/cart-badge.ts': "import { CartState } from '../cart-state';\nexport class CartBadge { s = CartState; }\n",
  });
  assert.equal(ok.code, 0, ok.out);
  const bad = cruiseWeb({
    ...webCart,
    'src/cart/cart-badge/cart-badge.ts': "import { CartApi } from '../cart-api';\nexport class CartBadge { a = CartApi; }\n",
  });
  assert.notEqual(bad.code, 0, bad.out);
  assert.match(bad.out, /ui-no-data/);
});

test('Angular naming: page importing a mapper or rules file is forbidden, state may import them', () => {
  const files = {
    ...webCart,
    'src/cart/cart-mapper.ts': 'export const toCartView = () => 1;\n',
    'src/cart/cart-rules.ts': 'export const canCheckout = () => true;\n',
  };
  for (const f of ['cart-mapper', 'cart-rules']) {
    const bad = cruiseWeb({ ...files, 'src/cart/cart-page.ts': `import * as m from './${f}';\nexport class CartPage { m = m; }\n` });
    assert.notEqual(bad.code, 0, bad.out);
    assert.match(bad.out, /ui-no-data/);
  }
  const ok = cruiseWeb({ ...files, 'src/cart/cart-state.ts': "import { toCartView } from './cart-mapper';\nexport class CartState { v = toCartView; }\n" });
  assert.equal(ok.code, 0, ok.out);
});

test('Angular naming: mapper and api do not import state, state does not import page or component folders', () => {
  const lower = cruiseWeb({
    ...webCart,
    'src/cart/cart-mapper.ts': "import { CartState } from './cart-state';\nexport const m = CartState;\n",
  });
  assert.match(lower.out, /lower-no-ui/);
  const state = cruiseWeb({
    ...webCart,
    'src/cart/cart-page.ts': 'export class CartPage {}\n',
    'src/cart/cart-state.ts': "import { CartPage } from './cart-page';\nexport class CartState { p = CartPage; }\n",
  });
  assert.match(state.out, /state-no-ui/);
});

test('Angular naming: the dotted form and a submodule with index.ts are not component folders', () => {
  const ok = cruiseWeb({
    ...webCart,
    'src/cart/cart.page.ts': "import { CartState } from './cart-state';\nexport class CartPage { s = CartState; }\n",
    'src/cart/items/index.ts': "export { Items } from './items-api';\n",
    'src/cart/items/items-api.ts': 'export class Items {}\n',
    'src/cart/cart-state.ts': "import { CartApi } from './cart-api';\nimport { Items } from './items';\nexport class CartState { a = CartApi; i = Items; }\n",
  });
  assert.equal(ok.code, 0, ok.out);
});
