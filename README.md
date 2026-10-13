# fma-skill

> Русская версия: [README.ru.md](README.ru.md)

FMA (Fractal Module Architecture) is an agent skill for Angular and NestJS; it is a fork of the FDA idea (`chord-ts/fda`). The skill gives an AI coding agent the architecture rules (layers, tiers, ports, events, contracts) and ships machine-checkable enforcement templates.

Documentation: https://hooter.github.io/fma-skill/ (English and Russian). Build locally with `pnpm docs:dev`.

## Installing the skill

Copy `skills/fma/` to `.agents/skills/fma/` (or `~/.claude/skills/fma/`) in your project.

## Verifying the repository

```bash
pnpm install
pnpm test        # validator, evals, rule-check configs on fixtures
pnpm validate    # skill structure
```

## Wiring rule enforcement into a project

Two tool profiles (details in `skills/fma/references/enforcement.md`):

- **Baseline:** ESLint, Prettier, TypeScript 6. The primary profile, works everywhere.
- **Fast:** oxlint, oxfmt, `tsc` 7. Enable it where it works.

Copy the templates from `skills/fma/templates/` following the table in `enforcement.md`. `arch:check` selects the linter with the `--linter eslint|oxlint` flag.

TypeScript: dependency-cruiser, Sheriff and typescript-eslint need the TypeScript 6 JS API, and TypeScript 7.0 does not have one. `npm:@typescript/typescript6` is installed under the name `typescript`, and TypeScript 7 (`tsc`) is installed separately under the alias `@typescript/native`.

## Repository layout

```text
skills/fma/            the skill itself: SKILL.md, references/, templates/, evals/
scripts/               skill and eval validators, eval grader (with tests)
tests/enforcement/     tests of the enforcement templates on fixture projects
```
