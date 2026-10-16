---
name: fma
description: Fractal Module Architecture (FMA) for Angular and NestJS monorepos. Use when designing, creating, reviewing or refactoring domains, submodules and layers (ui, state, api, model, repo, domain), ports, facades, events, transports (RabbitMQ, Kafka), libs/contracts, and whenever FMA, the simple and rich tiers, module boundaries or arch:check come up.
---

# FMA (Fractal Module Architecture) for Angular and NestJS

You help design, create and check code following FMA. The idea comes from FDA (Fractal Domain Architecture, `chord-ts/fda`); FMA extends it for complex Angular and NestJS applications: an optional `domain` layer, ports, events, shared contracts and automated rule checking.

First find out which application you are working on: `apps/web` (Angular) or `apps/api` (NestJS). If unclear, ask. Then load the reference: Angular — `references/angular.md`, NestJS — `references/nestjs.md`.

## Principles

1. **Fractal.** A module's structure repeats at the submodule and domain levels. Component-level structure is not prescribed.
2. **Layer separation and explicit contracts.** One file, one role.
3. **Public entry point.** A module is visible to neighbors only through `index.ts` (and through `exports` in NestJS).
4. **Progressive complexity.** Simple things stay simple; complex things get protection.
5. **Rules are machine-checked:** run `arch:check` instead of judging by eye.

## Glossary

| Term | Meaning | Angular | NestJS |
|---|---|---|---|
| `ui` | rendering and input | `*-page.ts`, components in folders named by subject | none |
| `state` | state and commands | `*-state.ts`, facade/store on signals | none |
| `api` | the module's boundary with the outside world | `*-api.ts` (HTTP client) | `*.controller.ts`, `*.resolver.ts`, `*.consumer.ts`, `*.worker.ts` (pollers and scheduled jobs) |
| `model` | use cases and data | `*-mapper.ts`, `*-rules.ts` | `*.service.ts` |
| `repo` | access to data and external systems | interceptors, `shared/data` | `*.repository.ts`, adapters |
| `domain` | invariants, entities, events (`rich` only) | rarely | `domain/` |
| `port` | interface to the outside; two kinds, see "Module communication" | `InjectionToken` | abstract class or token |
| `facade` | the domain's public in-process contract | `index.ts` | `*.facade.ts` in `exports` |

The word "controller" is not an FMA layer. In NestJS a `controller` is an implementation of `api`.

## Tiers

- **`simple`** (default): `ui → state → api → model → repo`.
- **`rich`**: a module declares itself by having a `domain/` folder (even an empty one). There is no manifest.
  - `domain` is pure TS: no framework, no ORM, no `shared` (except pure utilities).
  - `model` reaches storage and external systems only through a port; the implementation lives in `repo`.
- Move to `rich` when there are invariants across several entities, or rules that must be tested without a DB or HTTP.
- Raising the tier does not change the module's public entry point.

## Dependency matrix

A row imports a column. `✔` allowed, `✘` forbidden.

| From ↓ / To → | ui | state | api | model | repo | domain | port | shared | contracts |
|---|---|---|---|---|---|---|---|---|---|
| ui | — | ✔ | ✘ | ✘ | ✘ | types | ✘ | ✔ | types |
| state | ✘ | — | ✔ | pure functions | ✘ | ✔ | ✘ | ✔ | ✔ |
| api | ✘ | ✘ | — | ✔ | ✘ | ✔ | ✘ | ✔ | ✔ |
| model | ✘ | ✘ | ✘ | — | `simple`: ✔, `rich`: ✘ | ✔ | ✔ | ✔ | ✔ |
| repo | ✘ | ✘ | ✘ | ✘ | — | ✔ | ✔ implements | ✔ | ✔ |
| domain | ✘ | ✘ | ✘ | ✘ | ✘ | — | ✘ | pure utilities | ✘ |

`*.policy.ts` files import `api` and `model`; `ui` reaches them only through `state`. A type used by several layers (for example a view model shared by `model`, `state` and `ui`) lives in `<domain>.types.ts`: every layer of the domain may import `types.ts`, and it imports nothing except `contracts`.

Between modules: the direction is `parent → child`; `child → parent` is forbidden; a neighbor is visible only through its public entry point; skipping layers is forbidden except in `✔` cells; cycles and `forwardRef` are forbidden.

## Module communication

- **Synchronous, in-process:** the neighbor's public entry point (`facade`).
- **Asynchronous:** domain events (see `references/contracts.md`).
- **RPC/HTTP:** between processes only.
- **UI composition:** a neighbor exposes a "showcase" (a component) through its `index.ts`; the neighbor's state is never imported.
- A vocabulary (enum, constants, ids) used by two or more domains and holding no logic is `shared/<segment>`, not a domain. If a cycle between domains appears, first check what crosses it: often one enum or type that belongs in the owner's `types.ts`. A service whose main job is a neighbor's repository means the logic sits in the wrong domain.
- Express a call to a neighbor through a **port** in the consumer's `ports/`; the implementation is a local `facade` or a remote client (see `references/transport.md`).
- Two kinds of ports. A **domain port** (its signature contains domain types, for example `CartRepositoryPort`) lives in its own domain's `ports/`, and the implementation lives in that same domain. An **infrastructure port** (shared types only: event publishing, clock, mail) and its adapters live in `shared/<segment>/` and are imported as `@shared/<segment>`. `shared` does not import domains, so a `shared` adapter cannot implement a domain port.

## Files and exports

- Folders and files are named by their subject, not by their code type. This is strict for Angular (the Angular Style Guide: no `ui/`, `components/`, `services/`; the layer is the end of the file name) and relaxed for NestJS, where the role folders `events/`, `ports/`, `domain/` are conventional (see `references/nestjs.md`).
- Only `index.ts` and the public contract file are mandatory. Create the rest as needed; empty files are forbidden.
- Move types and constants into `types.ts` / `constants.ts` (in Angular name the file by its subject, e.g. `cart-view.ts`) when several files use them or they are part of the public API; otherwise keep them next to the code.
- `index.ts` contains explicit named exports only. Do not use the `export *` form (including `export * as ns`).
- A module does not import its own `index.ts`.
- Path aliases: `@app/<domain>`, `@contracts/<domain>`, `@shared/<segment>`. Every alias leads only to the `index.ts` of a module or segment: `@app/<domain>/<file>` and `@shared/<segment>/<file>` are forbidden. Every `shared` segment has its own `index.ts`.
- An internal submodule `_sub/` and a public `sub/` differ only by route (own routes or controller); neighbors see both only through the parent's `index.ts`. A submodule does not import the parent's files and does not reach deep into sibling submodules.

```ts
// cart/index.ts
export type { CartSummary } from './types';
export { CART_PORT } from './ports/cart.port';
```

## Checklist

Checked automatically (`arch:check`):
1. Every module has an `index.ts`.
2. No `export *` in `index.ts`.
3. No import that bypasses a neighbor's `index.ts`.
4. `ui` does not import `api`, `model` or `repo`.
5. `model`, `api` and `repo` do not import `ui` or `state`.
6. `domain` does not import a framework, an ORM or `shared` (except pure utilities).
7. In `rich`, `model` does not import `repo` directly.
8. No cycles and no `forwardRef`.

Checked by the agent during review:
9. The tier was chosen by the criterion in the "Tiers" section.
10. A cross-domain call goes through a port or a public entry point.
11. Events are named and versioned per `references/contracts.md`.
12. Types and constants are extracted per the rule in "Files and exports".
13. `libs/contracts` contains only what is allowed.
14. An entity never leaks into an API response; mapping happens at the boundary.

## Scope and limits

FMA is not suitable for trivial applications without a backend, or when full DDD with event sourcing is needed. For CRUD-dominated applications the `simple` tier is enough.

## References

- Angular: `references/angular.md`
- NestJS: `references/nestjs.md`
- Contracts and events: `references/contracts.md`
- Transports and microservices: `references/transport.md`
- Rule enforcement: baseline profile (ESLint, Prettier) and fast profile (oxlint, oxfmt, TypeScript 7), Sheriff, dependency-cruiser, hook: `references/enforcement.md`
- Migrating from the original FDA: `references/migration.md`

## Response style

- Answer briefly and completely. Name the FMA rule behind each decision.
- On a violation, name the rule and propose a fix; run `arch:check` and quote its output.
- Prefer explicit contracts over implicit behavior.
