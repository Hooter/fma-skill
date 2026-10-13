# FMA for NestJS (`apps/api`)

A domain is a `@Module`. Submodules are wired in through `imports`; the public contract is the module's `exports` plus `index.ts`. Load together with `SKILL.md`.

## Domain structure

```text
apps/api/src/<domain>/
  index.ts                 # public entry point: Module, Facade, types, tokens, events
  <domain>.module.ts       # imports: submodules; exports: facade
  <domain>.controller.ts   # api (HTTP)
  <domain>.consumer.ts     # api (messages), if any
  <domain>.facade.ts       # public in-process contract
  <domain>.service.ts      # model: use cases, transactions
  <domain>.repository.ts   # repo
  <domain>.entity.ts       # ORM schema
  <domain>.policy.ts       # optional: guard + access rules
  events/                  # the domain's public events
  _<sub>/                  # internal submodule (with its own index.ts); <sub>/ with its own controller is public by route, visible to neighbors only through the parent's index.ts
  domain/                  # rich only: aggregates, value objects, domain events
  ports/                   # domain ports (rich and cross-domain); infrastructure ports (events, clock, mail) live in shared/<segment>
apps/api/src/shared/       # config, filters, pipes, interceptors, guards
```

## Rules

1. The public contract has two levels. `index.ts` exports what a neighbor may import: `Module`, `Facade` (also the DI token), types, tokens, events. The module's `exports` limits which providers a neighbor can obtain through DI: only the `Facade` goes out. The other providers (`service`, `repository`) appear neither in `index.ts` nor in `exports`.
2. A neighbor imports `CartModule` and `CartFacade` from the domain's `index.ts` (`@app/cart`) and injects the `Facade`. Calling another domain's `controller` or `service` is forbidden, and `arch:check` catches imports that bypass `index.ts`.
3. One `controller` / `consumer` method calls one use case; the use case orchestrates several providers.
4. Validation at the boundary: `ValidationPipe` + schemas from `@contracts/<domain>`. An entity never leaves the domain; entity → DTO mapping is mandatory.
5. `rich`: `domain/` is pure TS without Nest or ORM decorators. A port is an abstract class or a token; the implementation is wired with `{ provide, useClass }`; entity ↔ aggregate mapping is done by `repo`.
6. Transactions are the use case's responsibility (unit of work); a repository does not open a transaction.
7. Cross-cutting concerns (guards, filters, interceptors, pipes, config) live in `shared/`; a global filter turns domain errors into HTTP.
8. `forwardRef` is a boundary violation. If you need it, the boundary was drawn wrong.
9. `tsconfig` aliases: `@app/<domain>`, `@contracts/<domain>`, `@shared/<segment>`; importing `@app/<domain>/<file>` is forbidden.

Module and facade:

```ts
// cart/cart.facade.ts
import { Injectable } from '@nestjs/common';
import type { CartSummaryDto } from '@contracts/cart';
import { CartService } from './cart.service';

@Injectable()
export class CartFacade {
  constructor(private readonly carts: CartService) {}

  getSummary(userId: string): Promise<CartSummaryDto> {
    return this.carts.getSummary(userId);
  }
}
```

```ts
// cart/cart.module.ts
import { Module } from '@nestjs/common';
import { ItemsModule } from './_items/items.module';
import { CartController } from './cart.controller';
import { CartFacade } from './cart.facade';
import { CartService } from './cart.service';
import { CART_REPOSITORY } from './ports/cart-repository.port';
import { CartRepository } from './cart.repository';

@Module({
  imports: [ItemsModule],
  controllers: [CartController],
  providers: [CartService, CartFacade, { provide: CART_REPOSITORY, useClass: CartRepository }],
  exports: [CartFacade],
})
export class CartModule {}
```

A port for the `rich` tier:

```ts
// cart/ports/cart-repository.port.ts
import type { Cart } from '../domain/cart';

export const CART_REPOSITORY = Symbol('CART_REPOSITORY');

export interface CartRepositoryPort {
  load(userId: string): Promise<Cart>;
  save(cart: Cart): Promise<void>;
}
```

Public entry point:

```ts
// cart/index.ts
export { CartModule } from './cart.module';
export { CartFacade } from './cart.facade';
export type { CartSummaryDto } from '@contracts/cart';
export { CART_EVENTS } from './events/cart.events';
```

## Tests

- `service`: `Test.createTestingModule` with the repository replaced via its token.
- `domain`: unit tests without Nest.
- `api`: e2e through `supertest`.
- Boundary checks: `arch:check` (see `references/enforcement.md`).
