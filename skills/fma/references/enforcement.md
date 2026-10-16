# Rule enforcement

FMA rules are machine-checked. The templates live in `templates/` and are tested on fixture projects. Two tool profiles are supported; the architecture checks are shared between them.

## Profiles

| | Baseline profile | Fast profile |
|---|---|---|
| Linter | ESLint (+ `typescript-eslint`) | oxlint |
| Formatter | Prettier | oxfmt |
| TypeScript | 6.x under the name `typescript` | the same, plus `tsc` 7 under a separate alias `@typescript/native` |
| Status | primary, works everywhere | enable where it works; oxfmt is in beta |
| Templates | `eslint.config.mjs`, `prettierrc.json`, `lefthook.yml` | `oxlintrc.json`, `oxfmtrc.json`, `lefthook.fast.yml` |
| `arch:check` | `--linter eslint` (default) | `--linter oxlint` |

The baseline profile is what a project relies on by default. The fast profile is adopted gradually: for example oxlint instead of ESLint with the same `arch:check`, or `tsc` 7 for a fast type check next to TypeScript 6. Until a fast-profile tool works on your project, stay on the baseline. Profiles can be mixed (say, Prettier and oxlint): the linter and the formatter are independent.

## Tags

The layers from the matrix in `SKILL.md` are concepts; the templates tell them apart in different ways. The matrix is the source of truth; check the configs against it whenever the matrix changes.

The Sheriff template for Angular uses the tags `domain:<name>` (a domain and its `_submodules`), `layer:domain` (the `domain/` folder) and `kind:<segment>` (any `shared/<segment>` segment; rules are defined for `ui`, `util`, `data`). In dependency-cruiser layers are told apart by the end of the file name. NestJS: dotted suffixes (`.service.ts`, `.repository.ts`, `.controller.ts`). Angular (`arch:check` sets `FMA_APP=web` for `--web`): `-state.ts`, `-api.ts`, `-page.ts`, `-mapper.ts`, `-rules.ts` (the dotted `.state.ts` form is accepted too), and a folder of a domain without `index.ts` is a presentational component folder (`cart-badge/`). The legacy `ui/` folder is still recognized, but folders named by code type are not recommended in Angular (see `references/angular.md`).

## Tools

| Level | What it checks | Tool | Template |
|---|---|---|---|
| File, baseline | `forwardRef`, an alias import that bypasses `index.ts` (including dynamic `import()`) | ESLint | `templates/eslint.config.mjs` → `eslint.config.mjs` |
| File, fast | cycles, `forwardRef`, a static alias import that bypasses `index.ts` | oxlint | `templates/oxlintrc.json` → `.oxlintrc.json` |
| File | `export *` in `index.ts` | `arch-check` (tokenizer) | `templates/arch-check.mjs` |
| Formatting, baseline | code style, Angular templates | Prettier | `templates/prettierrc.json` → `.prettierrc` |
| Formatting, fast | code style | oxfmt | `templates/oxfmtrc.json` → `.oxfmtrc.json` |
| Module boundaries, Angular | module encapsulation by tags (barrel required) | Sheriff | `templates/sheriff.config.ts` → `apps/web/` |
| Layers and boundaries, both apps | `no-circular`, `no-deep-import`, `no-deep-shared`, `shared-no-domain`, `child-no-parent`, `sibling-sub-deep`, `ui-no-data`, `lower-no-ui`, `state-no-ui`, `service-no-controller`, `domain-pure`, `domain-isolated`, `rich-model-no-repo`, `rich-model-no-orm` | dependency-cruiser | `templates/dependency-cruiser.cjs` → `apps/<app>/.dependency-cruiser.cjs`; for Angular `FMA_SRC_ROOT=src/app` |
| A module, `_submodule` or `shared` segment has an `index.ts` | checklist item 1 | `arch-check` | `templates/arch-check.mjs` |

Cycles between modules are caught by dependency-cruiser (`no-circular`) in both profiles; in the fast profile the native oxlint rule `import/no-cycle` checks them too. The ESLint config is deliberately minimal: it contains only the architecture rules and plugs into your config (`export default [...fma, ...yourConfig]`), for example together with `angular-eslint`. Settings can be carried from Prettier to oxfmt with `oxfmt --migrate=prettier`.

### Installation

Baseline profile:

```bash
pnpm add -D eslint typescript-eslint prettier dependency-cruiser @softarc/sheriff-core lefthook
pnpm add -D "typescript@npm:@typescript/typescript6@^6.0.2"
```

If the project already has a regular `typescript` 6.x, the second command is not needed: the alias scheme is only needed for TypeScript 7.

The fast profile adds (or replaces ESLint and Prettier):

```bash
pnpm add -D oxlint oxfmt
```

### TypeScript 6 and 7

TypeScript 7.0 has no programmatic API; it is expected in 7.1 (see [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0)). dependency-cruiser, Sheriff and `typescript-eslint` import the package named `typescript`, so TypeScript 6 must live under that name. To also get a version 7 `tsc`, add a second alias:

```json
{
  "devDependencies": {
    "@typescript/native": "npm:typescript@^7.0.2",
    "typescript": "npm:@typescript/typescript6@^6.0.2"
  }
}
```

Result: `node_modules/.bin/tsc` is TypeScript 7 (fast type check, `tsc --noEmit`), `tsc6` is TypeScript 6, and the tools and `ng build` see TypeScript 6 under the name `typescript`. The scheme where `typescript` = 7 and `@typescript/typescript6` sits next to it was tried: dependency-cruiser can be redirected through pnpm `packageExtensions`, but Sheriff gets TypeScript 7 as a peer dependency and does not work. Until the API exists, keep `typescript` on TypeScript 6.

If version 7 ends up under the name `typescript`, `arch:check` reports it and fails; the same happens when dependency-cruiser processed 0 modules.

### Running

In the root `package.json` (baseline profile):

```json
{
  "scripts": {
    "arch:check": "node tools/arch-check.mjs --web apps/web --api apps/api --eslint-config eslint.config.mjs --depcruise-config apps/api/.dependency-cruiser.cjs"
  }
}
```

For the fast profile add `--linter oxlint --oxlint-config .oxlintrc.json` (the `--eslint-config` flag is then not needed).

Options for real projects:

| Flag | Meaning |
|---|---|
| `--api <dir>` | repeatable: several NestJS services in one run |
| `--api-root <path>` / `--web-root <path>` | domain root inside `src` (defaults `src` and `src/app`); `src/app` for `@nx/nest`, `src/app/features` for an Angular app that keeps domains in `features/` |
| `--non-domains a,b,c` (env `FMA_NON_DOMAINS`) | root folders that are infrastructure, not domains: they need no `index.ts` and a domain may import their files directly. Recommended for Nest: `common,config,database,migrations,metrics`; add `app` (composition root) when it sits next to the domains |
| `--infra-dirs a,b` (env `FMA_INFRA_DIRS`) | folders outside the domain root that must not import domains (rule `infra-no-domain`): `src/app/core,src/app/shared` next to an Angular `--web-root src/app/features`. In `--services` the field is `infraDirs` |
| `--tsconfig <file>` (env `FMA_TSCONFIG`) | tsconfig for alias resolution when the service has only `tsconfig.app.json`; the `paths` of a service tsconfig replace the base `paths`, so every library alias must be repeated there or the dependency stays invisible |
| `--services <file.json>` | per-service settings: `[{ "api": "apps/catalog", "root": "src", "nonDomains": ["common"], "tsconfig": "tsconfig.app.json" }]` (`web` instead of `api` for Angular) |
| `--report` | print every violation but exit 0, to adopt FMA gradually; drop the flag when the count reaches zero |

Two helper templates for adoption:

- `templates/rewrite-imports.mjs`: `node tools/rewrite-imports.mjs moves.json [--root <dir>] [--dry-run]` moves files (or folders, a key ending with `/`) by a table `{ "moves": { "old": "new" }, "aliases": { "@app/": "src/" } }` and rewrites relative and listed-alias imports in the moved files and in their importers. Line endings are preserved, so a CRLF file stays CRLF and the diff stays small. Packages and unknown aliases are not touched.
- `templates/entities.metadata.spec.ts`: a spec that checks that every TypeORM relation named by a string resolves to a registered entity (see `nestjs.md`).

Libraries of an Nx monorepo (`libs/shared/*`) are `shared` for FMA, not domains; they are resolved through the aliases above.

Copy `arch-check.mjs` into `tools/`. The same dependency-cruiser file is used for both apps: `arch-check` runs it with the app's `cwd` and sets `FMA_SRC_ROOT=src/app` itself for Angular. The `rich` tier is detected by the config automatically: if a domain or its `_submodule` has a `domain/` folder (even an empty one), the rules `rich-model-no-repo:<module>` and `rich-model-no-orm:<module>` apply to it (for a submodule the name looks like `cart/_items`). `tsconfig` aliases (`paths`) are picked up when the app has a `tsconfig.json`.

## Pre-commit hook

Baseline profile: copy `templates/lefthook.yml` to the project root as `lefthook.yml`. Fast profile: `templates/lefthook.fast.yml`. Install with `pnpm exec lefthook install`. The command order is the same:

1. the formatter on changed files (`prettier --write` or `oxfmt`), the result is added to the commit;
2. the linter on changed files (`eslint` or `oxlint`);
3. `arch:check` over the whole graph. Module boundaries cannot be judged from a list of changed files, so staged-file filtering does not apply to this command.

## CI

CI repeats the same commands without filtering and blocks the merge on a violation: the hook can be bypassed (`--no-verify`), so CI remains the mandatory safety net.

```bash
# baseline profile
pnpm exec prettier --check .
pnpm exec eslint -c eslint.config.mjs src
pnpm run arch:check
```

```bash
# fast profile
pnpm exec oxfmt --check .
pnpm exec oxlint -c .oxlintrc.json src
pnpm run arch:check
```

## arch:check

`arch:check` combines the checks and exits with code 1 on any violation. All checks run independently: a violation in `api` does not hide a violation in `web`.

1. every module has an `index.ts` (domain root: `src` for `api`, `src/app` for `web`; `shared` and `contracts` do not count as domains);
2. the `index.ts` barrel check (`export *`, `export * as ns`);
3. the linter with architecture rules (`--linter eslint` by default or `--linter oxlint`);
4. dependency-cruiser for `apps/api` and `apps/web` (for `web` with `FMA_SRC_ROOT=src/app`);
5. Sheriff for `apps/web`.

Checklist coverage: items 1–8 of `SKILL.md` are checked by these steps within the limitations below.

During review the agent runs `arch:check` and quotes the name of the violated rule (`no-circular`, `no-deep-import`, `ui-no-data`, `lower-no-ui`, `domain-pure`, `rich-model-no-repo:<module>`).

## Known limitations

- Sheriff rejects a `tsconfig` path mapping that leads to a nonexistent folder ("invalid path mapping detected"). Add the `@shared/*` and `@contracts/*` aliases at the same moment you create the first `src/app/shared/<segment>` folder and `libs/contracts/src/<domain>`; an empty project must not have the aliases before that.
- Contracts are checked by Sheriff: `libs/contracts/src/<name>` is a module tagged `kind:contracts` (the path is given from the root where `sheriff.config.ts` lives); contracts depend on nothing and are available to domains.
- Adapters of external systems (`*-adapter.service.ts`) and message-consuming services (`*-consumer.service.ts`, `*.worker.ts`) end with `.service.ts`/`.worker.ts` and are covered by the `service` and `api` rules respectively; a file that ends differently is not covered (see "Layers of adapters and consumers" in `nestjs.md`).
- Layers are determined by file names (NestJS `*.service.ts`, `*.repository.ts`; Angular `*-state.ts`, `*-api.ts`, `*-page.ts`, `*-mapper.ts`, `*-rules.ts`) and, in Angular, by component folders. A file with another name is not covered by the layer rules. A public submodule without `index.ts` would be taken for a component folder: give every module an `index.ts`.
- `ui/` and `domain/` are recognized in a domain and at any depth of submodules; `_submodules` are recognized by the `_` prefix. A public submodule `sub/` (without `_`) has no isolation rules of its own: it is closed to neighbors by the general `no-deep-import`.
- `modulesWithoutIndex` and `no-deep-import` treat any folder at the domain root, except `shared`, `contracts` and the `--non-domains` list, as a domain.
- Only one domain root per run: a project with domains in two places is described by two entries in `--services`.
- A cross-service rule ("only RPC, HTTP, events") is not automated (see `transport.md`).
- `no-circular` does not report cycles whose reported module is a `*.entity.ts` file: two-way ORM relations inside one domain (`Product ↔ ProductImage`) are normal. A cycle across domains still goes through `index.ts` and is reported there. The cycle check sees type-only imports (`tsPreCompilationDeps: true`). The report does not say what crosses a cycle arc (a value, a type or an enum): look at the imports yourself (see "Before breaking a cycle" in `nestjs.md`).
- A rule "a service imports no other service's `src`, only `libs/*`" is not in the template. To add it to a project copy: `from: { path: '^apps/<service>/' }, to: { path: '^apps/<other>/' }` in a run from the repository root.
- `arch:check` does not see what the TypeORM CLI loads (no `tsconfig-paths`): add a test or script that loads the data source and builds the metadata.
- `arch:check` stops when dependency-cruiser processed fewer modules than there are source files: `npx` in a folder without `package.json` runs in the nearest parent and silently checks other code.
- Service topology rules (`apps/<service>`) are not automated (see `transport.md`).
- Sheriff lets any domain import `layer:domain`; a neighbor's `domain/` is closed by dependency-cruiser (`no-deep-import`).
- The `domain → contracts` and `domain → port` rows of the matrix are not checked: `libs/contracts` lies outside `src`.

## Verify before enabling

Actual check results at the time the templates were created (ESLint 10.12, typescript-eslint 8.71, Prettier 3.9, oxlint 1.87, oxfmt 0.72, dependency-cruiser 18.6, Sheriff 0.20):

- ESLint: `no-restricted-imports` (`regex` in `patterns`, `importNames` in `paths`) works but does not look at dynamic `import()`; the template has `no-restricted-syntax` with an `ImportExpression` selector for that. In `esquery` selectors a slash inside a regular expression is written as `\x2f`.
- oxlint: `import/no-cycle` and `no-restricted-imports` work natively; the rule does not check dynamic `import()` (dependency-cruiser catches it: `no-deep-import`). `no-restricted-syntax` through oxlint JS plugins (alpha) is not used: the `export *` ban is checked by `arch-check`.
- dependency-cruiser rejects regular expressions with nested quantifiers as unsafe (for example `(.+/)?[^/]+`); the template uses `.*` and explicit alternatives. The `ui/` folder is recognized at the domain depth and one submodule level.
- Sheriff walks the graph from `entryFile` (`src/main.ts`): a module nobody imports is not checked. A parent module must import its `domain/` through `index.ts`. Config shape: the fields `version`, `entryFile`, `enableBarrelLess`, `modules`, `depRules`.
- Prettier with `parser: angular` formats Angular templates (`@if`, `@for` blocks get indentation). oxfmt processes `.html` but without the Angular parser: syntax is preserved, control-flow blocks are not indented, and the result differs from Prettier. So for projects with Angular templates the default formatter is Prettier.
- oxfmt is in beta: formatting may differ from Prettier in edge cases; Prettier plugins are not supported, Tailwind class sorting is built in.
- Pin library versions in the project's `package.json` and re-check them on upgrade.
