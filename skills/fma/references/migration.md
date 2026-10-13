# Migrating from the original FDA to FMA

FMA (Fractal Module Architecture) is a fork of FDA (Fractal Domain Architecture, `chord-ts/fda`) for Angular and NestJS. This file is for projects organized by the original skill (SvelteKit, Next.js, Nuxt) and for carrying FDA ideas over to Angular and NestJS.

## Term mapping

| Original FDA | FMA | Note |
|---|---|---|
| `+page.svelte` / `page.tsx` | `*.page.ts` + `ui/` (Angular) | none in NestJS |
| `controller.ts`, `controller.svelte.ts`, `stores.ts`, `state.ts` | `*.state.ts` | the word "controller" is not a layer |
| `rpc.ts` | `*.api.ts` (Angular), `*.controller.ts` / `*.consumer.ts` (NestJS) | |
| `model.server.ts` | `*.model.ts` (Angular), `*.service.ts` (NestJS) | |
| `lib/server/repo/*` | `*.repository.ts` | |
| `schema.ts` | `*.entity.ts` | |
| `policy.ts` | `*.policy.ts` | unchanged |
| `index.ts` with `export *` | `index.ts` with named exports | |
| `lib/ui`, `lib/universal` | `@shared/<segment>` | |
| `+page.server.ts` (mandatory) | not created | route `resolve` or `state` |

## Migration steps

1. Add the `@app/<domain>`, `@contracts/<domain>` and `@shared/<segment>` aliases to `tsconfig`.
2. Replace `export *` forms in every `index.ts` with explicit named exports.
3. Delete empty mandatory files (`+page.server.ts` and the like).
4. Wire up `arch:check` with ESLint (baseline profile; oxlint and oxfmt are optional) and the pre-commit hook per `references/enforcement.md`.
5. Fix the violations `arch:check` reports, starting with cycles and imports that bypass `index.ts`.
6. Choose the tier of each domain. For domains with invariants, add `domain/` and ports as they grow.
7. Move shared DTOs into `libs/contracts` and replace the local copies.
