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

Folders in a NestJS domain. Several folders here are named by role, not by subject: `events/`, `ports/`, `domain/`, `_<sub>/` and, in projects that use them, `dto/` or `entities/`. The Angular Style Guide does not apply to NestJS, and in a Nest project these folders are conventional: without them a domain with a dozen files becomes hard to scan, and the tier (`domain/`) and the public contract (`events/`) are read from them. Still, prefer the file suffix (`cart.service.ts`) to a folder as the carrier of the layer, and do not add a folder named only by type (`services/`, `utils/`, `common/`) inside a domain: a folder earns its place by holding one subject or one tier marker. This is an open question: whether such folders get in the way is to be collected from real projects.

The domain root is `src` by default. The `@nx/nest` generator puts code in `src/app`; that root works too (`--api-root src/app`), but `AppModule` and the other composition-root files are not a domain, and every domain is its own folder directly under the root, never nested inside one. A folder that is not a domain (`common`, `config`, `database`, `migrations`, `metrics`, `app`) is either moved into `shared/<segment>/` or listed in `--non-domains`; `migrations` is usually listed rather than moved: TypeORM migration paths depend on it. In a monorepo of several services each service is its own FMA application; between services only RPC, HTTP or events are allowed (`references/transport.md`).

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
10. A neighbor's data comes only through its facade. `@InjectRepository(NeighborEntity)` and `TypeOrmModule.forFeature([NeighborEntity])` are boundary violations: `forFeature` lists only the domain's own entities.
11. A vocabulary that two or more domains need and that holds no logic (platform enum, config of platforms, ids) is `shared/<segment>`. The sign: a type or constant without which neither domain compiles.

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

## Patterns

Facade as commands. A facade method is a use case with plain input types from `<domain>/types.ts` (`upsertFromImport`, `createFromPull`, `updateFromPull`), 3–5 methods per neighbor. The entity never leaves. A chain stays one-directional: the upper domain calls the lower facade, the lower calls the facades below it (`variants` → `FamiliesFacade`). A find-or-create-by-name facade (import) returns an id or a record type, not an entity.

Read records. A neighbor's mapper may need fields of another domain's entity. Export a record type, not the class: `export type VariantRecord = ProductVariant` in `records.ts`, re-exported from `index.ts` as `export type`. Fields are visible, the class is not injectable, and an API response is still built through a DTO (checklist item 14).

Entity relations across domains. `@ManyToOne('Category')` (the relation name as a string) plus `import type { Category } from '../../categories'` removes the import of the neighbor's class. Test it without a database: relation names in `getMetadataArgsStorage().relations` match registered entities. Verify the full metadata with a script that loads the data source through `ts-node` and the service tsconfig (`buildMetadatas()` under SWC infers `Object` for `string | null` columns without an explicit `type`). Two-way relations between entities of one domain form cycles that are normal for an ORM: exclude `*.entity.ts` of one domain from `no-circular`.

Files reached from the TypeORM CLI. Entities and data sources are loaded by `ts-node` without `tsconfig-paths`. In an entity, cross-domain imports are `import type` only. A value needed by entities of two domains (an enum) is a shared vocabulary and is imported relatively from the segment's `index.ts`, not through the heavy `index.ts` of a domain (it pulls the whole module graph and its aliases).

Dependency inversion with a registry. Domain A stores credentials, domain B checks them against providers, so A would import B and B would import A. Reverse it: A owns the port (`CredentialsVerifier`) and the registry (`CredentialsVerifierRegistry` with `register()`), B implements the verifiers and registers them in `OnModuleInit`. A multi-provider token cannot be assembled in module A without importing B. Test the registry composition through the module's metadata.

Event publishing. The transport (AMQP) is infrastructure in `shared/events`. The domain event is built in the domain whose use case triggers it, with neighbor data obtained through facades. `shared` cannot import domains, and the composition root (`app`) is not the place for domain logic.

Before breaking a cycle with facades, check what actually crosses it: often it is one enum, type or constant that sits in the wrong domain (`MarkType` in a legacy domain's entity). Move it to `<domain>/types.ts` of the owner and export it from `index.ts`; a cycle between two domains often disappears. The same applies to `service ↔ store` pairs sharing a type.

A domain written in the wrong place. If a service's main job is the repository of a neighbor, or a shared `cleanup` knows the entities of three domains, the logic belongs to the owner. After the move the facades shrink to 1–3 methods.

Move checklist. When logic moves to the owner domain: metrics (counters are counted where the entity is created), events and logs, tests (a unit test of the facade at the consumer, tests of the implementation at the owner). Estimate the effort by the number of places where a domain reads a neighbor's repository, not by file count. When rewriting files in bulk keep line endings: a CRLF file rewritten to LF bloats the diff.

## Tests

- `service`: `Test.createTestingModule` with the repository replaced via its token.
- `domain`: unit tests without Nest.
- `api`: e2e through `supertest`.
- Boundary checks: `arch:check` (see `references/enforcement.md`).
