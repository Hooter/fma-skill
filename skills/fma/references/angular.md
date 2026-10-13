# FMA for Angular (`apps/web`)

Layers are compressed: there is no `.server` suffix and no classic `repo` on the client. The chain is `page → ui → state → api → model`. Load together with `SKILL.md`.

## Domain structure

```text
src/app/<domain>/
  index.ts               # public entry point: types, tokens, events, routes, showcase components
  <domain>.routes.ts     # lazy routes, route-level providers
  <domain>.page.ts       # routed component
  <domain>.state.ts      # facade on signals
  <domain>.api.ts        # HttpClient, returns DTOs from @contracts/<domain>
  <domain>.model.ts      # DTO → view-model mapping, client-side rules
  ui/                    # presentational, OnPush, input()/output()
  _<sub>/                # internal submodule (with its own index.ts); <sub>/ with its own routes is public by route, visible to neighbors only through the parent's index.ts
  domain/                # rich only: pure TS, no Angular
src/app/shared/          # ui/, util/, data/ — shared code (alias @shared/<segment>)
```

Mapping to terms: `page` and `ui` are the `ui` layer; `state` is `state`; `api` is `api`; `model` is `model`; `domain/` is the `domain` of the `rich` tier.

## Rules

1. `ui` injects only its own domain's `state`.
2. State is created at the route level (`providers` in `Route`), not as `providedIn: 'root'`; the exception is state from `shared/`.
3. External dependencies are expressed as tokens (`InjectionToken`). In `rich`, the port lives next to `model` and the implementation is provided in the route's `providers`.
4. `state` handles form submit; the component only passes values.
5. SSR specifics (`RenderMode`, `TransferState`) live in `app.routes.server.ts` and `shared/`; the domain does not depend on the runtime environment.
6. Request and response types come only from `@contracts/<domain>`; the domain holds view models, not its own DTOs.
7. Naming follows the Angular Style Guide (no `.component`); the file's role is shown by the `.page`, `.state`, `.api`, `.model` suffix.
8. `tsconfig` aliases: `@app/<domain>` → `src/app/<domain>`, `@contracts/<domain>` → `libs/contracts/src/<domain>`, `@shared/<segment>` → `src/app/shared/<segment>`. Importing `@app/<domain>/<file>` is forbidden.
9. Linking domains: a neighbor exposes a showcase component through `index.ts`; data flows through component inputs or events, and the neighbor's state is never imported.

Example of `state` on signals:

```ts
// cart/cart.state.ts
import { Injectable, computed, inject, signal } from '@angular/core';
import type { CartDto } from '@contracts/cart';
import { CartApi } from './cart.api';
import { toCartView } from './cart.model';

@Injectable()
export class CartState {
  private readonly api = inject(CartApi);
  private readonly dto = signal<CartDto | null>(null);

  readonly view = computed(() => (this.dto() ? toCartView(this.dto()!) : null));

  async load(userId: string): Promise<void> {
    this.dto.set(await this.api.getCart(userId));
  }
}
```

Route-level state:

```ts
// cart/cart.routes.ts
import type { Routes } from '@angular/router';
import { CartApi } from './cart.api';
import { CartState } from './cart.state';

export const CART_ROUTES: Routes = [
  {
    path: '',
    providers: [CartApi, CartState],
    loadComponent: () => import('./cart.page').then((m) => m.CartPage),
  },
];
```

A port for the `rich` tier:

```ts
// cart/cart.model.ts (excerpt)
import { InjectionToken } from '@angular/core';
import type { Cart } from './domain';

export interface CartRepositoryPort {
  load(userId: string): Promise<Cart>;
}
export const CART_REPOSITORY = new InjectionToken<CartRepositoryPort>('CART_REPOSITORY');
```

Public entry point:

```ts
// cart/index.ts
export { CART_ROUTES } from './cart.routes';
export { CartBadge } from './ui/cart-badge';
export type { CartView } from './cart.model';
```

## Tests

- `state`: `TestBed` with tokens and `api` replaced.
- `domain`: pure unit tests without Angular.
- `ui`: component tests with a `state` stub.
- Boundary checks: `arch:check` (see `references/enforcement.md`).
