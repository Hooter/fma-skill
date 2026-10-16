# FMA for Angular (`apps/web`)

Layers are compressed: there is no `.server` suffix and no classic `repo` on the client. The chain is `page → ui → state → api → model`. Load together with `SKILL.md`.

Naming follows the [Angular Style Guide](https://angular.dev/style-guide): organize by feature, not by code type; a file is named after the main identifier it holds in kebab-case (`CartState` → `cart-state.ts`); a component's `.ts`, `.html`, `.css` and `.spec.ts` share one base name; tests sit next to the code; one concept per file; no generic names (`helpers.ts`, `utils.ts`, `common.ts`, `types.ts`). The layer is shown by the class name and the end of the file name, never by a folder.

## Domain structure

```text
src/app/<domain>/
  index.ts               # public entry point: types, tokens, events, routes, showcase components
  <domain>.routes.ts     # lazy routes, route-level providers (the Angular CLI name, like app.routes.ts)
  <domain>-page.ts       # class <Domain>Page: routed component (+ .html, .css, .spec.ts)
  <domain>-state.ts      # class <Domain>State: facade on signals
  <domain>-api.ts        # class <Domain>Api: HttpClient, returns DTOs from @contracts/<domain>
  <domain>-mapper.ts     # DTO → view-model functions (toCartView)
  <domain>-rules.ts      # client-side rules, pure functions
  <domain>-view.ts       # view models and types used by several files (named by the subject, not types.ts)
  cart-badge/            # presentational component: a folder named by what it shows, OnPush, input()/output()
    cart-badge.ts
  _<sub>/                # internal submodule (with its own index.ts); <sub>/ with its own routes is public by route, visible to neighbors only through the parent's index.ts
  domain/                # rich only: pure TS, no Angular (the folder marks the tier; name its files by the business concept)
src/app/shared/          # ui/, util/, data/ — shared code (alias @shared/<segment>)
```

A presentational component lives in a folder named by its subject (`cart-badge/`, `film-calendar/`). Folders named by code type (`ui/`, `components/`, `services/`, `directives/`) are not recommended: the Angular Style Guide asks to organize by feature, and such a name says nothing about the content. A folder of a domain without `index.ts` is a component folder; a folder with `index.ts` is a module (a submodule). The dotted form (`cart.state.ts`, `cart.page.ts`) and the `ui/` folder of earlier FMA versions are still recognized by `arch:check`, so a project can migrate file by file.

Domain root. The default is `src/app`. An app that keeps domains in `features/` and infrastructure in `core/` runs with `--web-root src/app/features`: only the contents of `features/` are checked as domains, and `core/` and `shared/` must not import features (keep auth, guards and interceptors in `core`, move domain services and stores into the feature that owns them). A domain nested one level deeper than the root is not a domain: every domain is a folder directly under the root.

Mapping to terms: `*-page.ts` and the component folders are the `ui` layer; `*-state.ts` is `state`; `*-api.ts` is `api`; `*-mapper.ts` and `*-rules.ts` are `model`; `domain/` is the `domain` of the `rich` tier. `model` stays a concept of the dependency matrix and is not a file suffix: name files by what they contain (`-mapper`, `-rules`).

## Rules

1. `ui` injects only its own domain's `state`.
2. State is created at the route level (`providers` in `Route`), not as `providedIn: 'root'`; the exception is state from `shared/`.
3. External dependencies are expressed as tokens (`InjectionToken`). In `rich`, the port lives in its own file (`cart-repository.ts`) and the implementation is provided in the route's `providers`.
4. `state` handles form submit; the component only passes values.
5. SSR specifics (`RenderMode`, `TransferState`) live in `app.routes.server.ts` and `shared/`; the domain does not depend on the runtime environment.
6. Request and response types come only from `@contracts/<domain>`; the domain holds view models, not its own DTOs.
7. Naming follows the Angular Style Guide (no `.component` suffix, kebab-case, file = main identifier): the role is the end of the file and class name (`cart-page.ts` → `CartPage`, `cart-state.ts` → `CartState`, `cart-api.ts` → `CartApi`, `cart-mapper.ts`, `cart-rules.ts`). Directive selectors use the application prefix and camelCase attributes. An event handler is named by the action (`saveCart()`), not by the event (`handleClick()`).
7a. Class style: `inject()` instead of constructor injection; `protected` for members read only by the template; `readonly` for signals, inputs, outputs and queries; keep template logic simple and move the rest into `computed`.
8. `tsconfig` aliases: `@app/<domain>` → `src/app/<domain>`, `@contracts/<domain>` → `libs/contracts/src/<domain>`, `@shared/<segment>` → `src/app/shared/<segment>`. Importing `@app/<domain>/<file>` is forbidden.
9. Linking domains: a neighbor exposes a showcase component through `index.ts`; data flows through component inputs or events, and the neighbor's state is never imported.
10. A cycle `service ↔ store` through a shared type is broken by moving the type into its own file (`user-profile.ts`).
11. Lazy loading. If the neighbor imports a service from `index.ts`, anything else exported there lands in the neighbor's chunk. When routes and components make that costly, keep `index.ts` to what neighbors need (services, stores, types) and let the composition root (`app.routes.ts`) load `<domain>.routes.ts` by its path; this is a conscious exception to the `index.ts` example below.

Example of `state` on signals:

```ts
// cart/cart-state.ts
import { Injectable, computed, inject, signal } from '@angular/core';
import type { CartDto } from '@contracts/cart';
import { CartApi } from './cart-api';
import { toCartView } from './cart-mapper';

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
import { CartApi } from './cart-api';
import { CartState } from './cart-state';

export const CART_ROUTES: Routes = [
  {
    path: '',
    providers: [CartApi, CartState],
    loadComponent: () => import('./cart-page').then((m) => m.CartPage),
  },
];
```

A port for the `rich` tier:

```ts
// cart/cart-repository.ts (excerpt)
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
export { CartBadge } from './cart-badge/cart-badge';
export type { CartView } from './cart-view';
```

## Tests

- `state`: `TestBed` with tokens and `api` replaced.
- `domain`: pure unit tests without Angular.
- `ui`: component tests with a `state` stub; the `*.spec.ts` file sits next to the file it tests, never in a central `tests` folder.
- Boundary checks: `arch:check` (see `references/enforcement.md`).
