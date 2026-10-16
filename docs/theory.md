# Theory: why FMA looks the way it does

This page explains the reasoning behind FMA: the problem it solves, how the principles turn into rules, what you gain and lose, and how it differs from Feature-Sliced Design (FSD), DDD and Clean Architecture. The skill itself stays short; this is the background for people.

## The problem

Applications on Angular and NestJS usually degrade in the same ways:

- **Technical folders.** `components/`, `services/`, `models/` grow without bound; one feature is scattered across five folders, and a change touches all of them.
- **Hidden coupling.** Any file can import any other, so "private" code becomes a public API by accident, and cycles appear.
- **Rules that live in people's heads.** A code review catches a boundary violation once; a month later it returns.
- **One size for everything.** Either every CRUD screen gets ceremony (repositories, mappers, use-case classes), or complex business rules sit in a service next to HTTP and ORM code.

FMA is a small set of structural rules aimed at these four problems.

## Principles and what they cost

| Principle | Problem it answers | Concrete rule | Price |
|---|---|---|---|
| **Domain first** | scattered features | the top-level folders are domains, not technical layers | you must decide where the domain boundaries are |
| **Fractal** | inconsistent structure; a new submodule means a new design | a submodule has the same shape as a domain | some small submodules carry unused structure |
| **Layers with a dependency matrix** | tangled responsibilities | `ui → state → api → model → repo`, a table of allowed imports | more files than "everything in one service" |
| **Public entry point** | hidden coupling | a module is reachable only through `index.ts`; no `export *` | barrels must be maintained |
| **Ports and events across domains** | domains depending on each other's internals | call a neighbor through a port; talk asynchronously through versioned events | indirection; events add eventual consistency |
| **Progressive complexity (tiers)** | ceremony for simple code, no protection for complex code | `simple` by default; a `domain/` folder switches a module to `rich` | two ways of writing code in one codebase |
| **Machine-checked rules** | rules that live in heads | `arch:check` fails the build on a violation | tooling setup; layers are recognized by file names |

## How it works

### 1. Domains as modules

A domain is a cohesive area of the product (`cart`, `orders`, `catalog`). Its code lives together: UI, state, API, business logic, persistence. The aim is **change locality**: a typical change should touch one domain. The domain's boundary is an agreement between people and a compile-time constraint for code.

### 2. Layers inside a domain

Inside a domain, each file has exactly one role, and the allowed import directions form a matrix (see the [Guide](/guide) and `SKILL.md`). The point is not the number of layers but that **the direction is fixed**: `ui` never reaches `repo`, `model` never imports `ui`. Given the matrix, "where does this code go?" has a mechanical answer.

**Naming.** In Angular, FMA follows the [Angular Style Guide](https://angular.dev/style-guide): code is organized by subject, not by type, a file is named after its main identifier (`CartState` → `cart-state.ts`), and the layer is read from the end of the name (`-page`, `-state`, `-api`, `-mapper`, `-rules`). Folders named by code type (`ui/`, `components/`, `services/`) are not recommended; presentational components live in folders named by subject (`cart-badge/`). In NestJS the role folders `events/`, `ports/`, `domain/` stay conventional and the layer is carried by the suffix (`cart.service.ts`). Whether such folders are convenient in practice is still being collected from real projects.

### 3. The public entry point

Everything a domain offers to neighbors is listed in one file, `index.ts` (plus the `exports` of the NestJS module). It is an explicit contract: if a symbol is not exported there, nobody outside can depend on it, so you can refactor the inside freely. Allowing only named exports (no `export *`) keeps the contract readable and reviewable.

### 4. Crossing domain boundaries

There are three ways, in order of preference:

1. **A port in the consumer.** `orders` declares what it needs (`CartPort`); the implementation is the neighbor's `facade` in a monolith or an HTTP client between services. The consumer's code does not change when you split the monolith.
2. **Events.** A domain publishes `cart.item-added` (a versioned contract in `libs/contracts`); others react in their own `model`. This removes the compile-time dependency entirely.
3. **UI composition.** A neighbor exposes a ready-made component through its `index.ts`; its state is never imported.

Two kinds of ports exist because of one constraint: `shared` does not import domains. A port whose signature contains domain types (a repository) belongs to the domain; a port with only generic types (event publishing, clock, mail) belongs to `shared`.

### 5. Tiers

Most code is CRUD with a thin layer of rules. `simple` serves it: `model` talks to `repo` directly. When a domain has **invariants across several entities** or rules that must be tested without a database or HTTP, you add a `domain/` folder. This is the whole switch. The domain becomes pure TypeScript, and `model` reaches storage only through a port. The module's public entry point does not change, so neighbors are unaffected.

### 6. Rules enforced by tools

Conventions erode unless something fails when they are broken. In FMA the matrix and the entry-point rule are compiled into configs for dependency-cruiser, Sheriff and ESLint/oxlint, and `arch:check` runs them together in the pre-commit hook and in CI. This is what the literature calls an *architectural fitness function*. It also makes the architecture friendly to AI agents: the agent reads the rules, writes code, runs `arch:check`, and gets an exact rule name when it is wrong.

## Advantages

- **Locality of change** and an obvious place for every file.
- **Boundaries that hold**, because they fail the build rather than rely on review.
- **A cheap path from monolith to services**: ports and event contracts are already there.
- **Proportional effort**: simple domains stay simple; complex ones get isolation and fast, database-free tests.
- **One vocabulary for frontend and backend**, with shared Zod contracts as the single source of truth for types and validation.
- **Predictable for newcomers and for agents**: the structure is the same at every level.

## Disadvantages and limits

- **More files and indirection** than a plain service; the `rich` tier adds ports and mapping between entity and aggregate.
- **Barrels cost something**: every module and shared segment needs an `index.ts`, and imports through aliases must stay shallow.
- **Boundaries are your decision.** Wrong domain boundaries are expensive; FMA does not tell you where they go.
- **Layers are recognized by file names** (`*.service.ts`, `*-state.ts`). A file with another name escapes the layer rules.
- **Tooling is not trivial**: dependency-cruiser and Sheriff need TypeScript 6's API (see [Enforcement](/references/enforcement)); some service-topology rules are not automated yet.
- **Not full DDD.** No event sourcing, no context maps or anti-corruption layers as first-class concepts.
- **Eventual consistency** appears as soon as you use events between domains; sagas and idempotent consumers are your responsibility.
- **Overkill for tiny apps** without a backend or with only a few screens.

## How it differs from other approaches

### Feature-Sliced Design (FSD)

FSD is a frontend methodology: horizontal layers (`app`, `pages`, `widgets`, `features`, `entities`, `shared`), vertical slices inside each layer, and segments (`ui`, `model`, `api`, `lib`) inside each slice. A module may import only from layers below it, and each slice exposes a public API.

| | FSD | FMA |
|---|---|---|
| Primary axis | layer by *scope of reuse* (feature, entity, widget...) | *domain*, then layers inside it |
| Cross-module dependency | downward only, across layers | through a port, an event or a showcase component; no global layer ranking |
| Scope | frontend | Angular and NestJS in one monorepo, shared contracts |
| Public API | `index` per slice | `index.ts` per module and per `shared` segment |
| Typical friction | deciding whether something is a feature, an entity or a widget | deciding where domain boundaries lie |
| Complexity levels | none built in | `simple` / `rich` tiers |

They share the public-API idea and enforcement by lint rules. FMA trades FSD's universal layer ranking for domain ownership, which suits backends and large domain-heavy frontends better.

### Domain-Driven Design (DDD)

DDD has a *strategic* part (ubiquitous language, bounded contexts, context maps) and a *tactical* part (entities, value objects, aggregates, domain events, repositories).

- A FMA **domain** is a lightweight, code-level stand-in for a bounded context: a unit with its own model and a public interface. It does not require a full context map.
- The **`rich` tier borrows the tactical toolkit**: a pure `domain/` with aggregates and value objects, repository ports, domain events.
- The **`simple` tier deliberately does not**: in a CRUD domain, aggregates would be ceremony.
- FMA adds what DDD leaves open: concrete folder structure, a dependency matrix, and tooling to check it.
- FMA omits event sourcing, CQRS as a requirement, and formal integration patterns such as anti-corruption layers. Add them if you need them, but they are outside the skill.

### Clean Architecture and Hexagonal (ports and adapters)

Clean Architecture organizes code in concentric circles (entities, use cases, interface adapters, frameworks) with one rule: dependencies point inward. Hexagonal architecture expresses the same idea with ports and adapters.

| | Clean / Hexagonal | FMA |
|---|---|---|
| Top-level split | usually by circle (layer) | by domain, then by layer |
| Dependency inversion | everywhere the boundary crosses a circle | only where needed: in `rich` for storage, and for cross-domain calls and infrastructure |
| Shape | concentric circles | a linear chain with an explicit allowed-imports matrix |
| Use cases | a first-class class per use case | the `model` layer (a service method in NestJS) |
| Frontend | not specified | an Angular-specific compression of the layers |

FMA keeps the best part of Clean (a pure domain core behind ports) but makes it **optional and local to a domain** rather than a global rule, and adds the vertical (domain) axis that Clean leaves open.

### In one sentence each

- **FSD:** layers by reuse scope, frontend only; **FMA:** domains first, front and back.
- **DDD:** a modeling method; **FMA:** a code structure that can host DDD tactics when a domain needs them.
- **Clean:** inward dependencies everywhere; **FMA:** inversion where it pays, plus domain-first packaging.

## When to choose FMA

Choose it when you have an Angular + NestJS monorepo, several domains that will keep growing, and a team (or agents) that benefits from rules checked by tools. Skip it for prototypes, tiny apps, or when you truly need event sourcing and a full DDD toolkit.

## Adopting it step by step

1. Draw the domain boundaries on paper first (nouns of the business, not screens).
2. Create `index.ts` for each and switch imports to the public entry points.
3. Turn on `arch:check` with the baseline profile; fix cycles and deep imports first.
4. Move to `rich` only for domains with real invariants.
5. Introduce ports and events when a second consumer or a service split appears, not before.
