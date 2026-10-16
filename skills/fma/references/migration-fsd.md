# Migrating from Feature-Sliced Design to FMA

For frontends organized as FSD (`app`, `pages`, `widgets`, `features`, `entities`, `shared`; segments `ui`, `model`, `api`, `lib`). Both have a public API per module and lint-enforced boundaries; they differ in the primary axis. FSD ranks layers by scope of reuse and allows imports only downward; FMA makes a **domain** the axis and puts the layers inside it. Load together with `SKILL.md` and `references/angular.md`.

## Term mapping

| FSD | FMA | Note |
|---|---|---|
| `app/` | composition root (`main.ts`, `app.routes.ts`, providers); not a domain | list it in `--non-domains` if it stays next to the domains |
| `entities/<e>` | the domain `<e>` (data, rules); its pure part is `domain/` in the `rich` tier | merge with the `features/<e>` of the same subject |
| `features/<f>` | the domain `<f>`, or an internal submodule `_<f>` of the domain that owns it | a feature used by one domain only is a submodule |
| `widgets/<w>` | a showcase component exported from the `index.ts` of the domain that owns the data | a widget that mixes several domains is a page or a composition-root component |
| `pages/<p>` | `<domain>-page.ts` of the owning domain, routes in `<domain>.routes.ts` | |
| `shared/ui`, `shared/lib`, `shared/api`, `shared/config` | `shared/ui`, `shared/util`, `shared/data`, constants by subject | each segment has its own `index.ts`; `shared` imports no domain |
| segment `ui` | `*-page.ts` and component folders named by subject (`cart-badge/`) | not a folder named `ui` |
| segment `model` | `*-state.ts` (state), `*-mapper.ts`, `*-rules.ts` | |
| segment `api` | `*-api.ts` | |
| segment `lib` | a file named by its subject, or `shared/util` if several domains use it | not `helpers.ts` |
| cross-slice `@x` imports | a port, an event or a showcase component through `index.ts` | there is no global layer ranking in FMA |
| slice `index.ts` | `index.ts` of the module (named exports only, no `export *`) | |

## Migration steps

1. Inventory. List the slices and who imports them. A slice name that exists in `entities` and in `features` is one domain.
2. Choose the domains by the subject, not by the layer. Keep `simple` for all of them; add `domain/` only where invariants appear.
3. Generate a proposal: `node tools/fsd-to-fma.mjs --src src > moves.json` (or `--src src/app`). Every slice becomes a domain folder; slices that share a name are listed under `merge` and must be merged by hand. Review and edit `moves.json`.
4. Move the folders and rewrite the imports: `node tools/rewrite-imports.mjs moves.json --dry-run`, then without `--dry-run` (see `references/enforcement.md`). Replace the `@entities/*`, `@features/*`, `@widgets/*`, `@pages/*` aliases with `@app/<domain>` in `tsconfig` and pass them as `aliases`.
5. Rename inside each domain by the mapping above: segments become `-state`, `-api`, `-mapper`, `-rules` files, `ui` becomes component folders named by subject, each domain gets an `index.ts` with named exports.
6. Wire up `arch:check` in the report mode: `--web-root src/app --non-domains app --report` (see `references/enforcement.md`). Fix cycles and imports that bypass `index.ts` first; a cycle between two former layers usually means a type that belongs in the owner's `<domain>-view.ts`.
7. Replace downward-only cross-slice imports: a call to a neighbor goes through its `index.ts`, a shared flow through a port, a notification through an event.
8. Drop `--report` when the count reaches zero and add `arch:check` to the pre-commit hook and CI.

What FMA does not check that FSD linters do: the rank of layers. After the migration the rule is "a neighbor only through its public entry point and no cycles", not "only downward".
