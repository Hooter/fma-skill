# Guide

FMA (Fractal Module Architecture) is an agent skill for Angular and NestJS. It is a fork of the FDA idea (`chord-ts/fda`) that adds an optional `domain` layer, ports, events, shared contracts and automated rule checking.

## Install the skill

Copy `skills/fma/` from the [repository](https://github.com/Hooter/fma-skill) to `.agents/skills/fma/` (or `~/.claude/skills/fma/`) in your project.

## How it works

The agent loads `SKILL.md`, then the reference for your app: [Angular](/references/angular) for `apps/web` or [NestJS](/references/nestjs) for `apps/api`.

- **Fractal:** a module's structure repeats at the submodule and domain levels.
- **Layers:** `ui → state → api → model → repo`, plus an optional `domain` (the `rich` tier).
- **Public entry point:** a module is visible to neighbors only through `index.ts`; `export *` is forbidden.
- **Ports:** calls to neighbors and external systems go through ports.
- **Machine-checked:** `arch:check` runs the linter, dependency-cruiser and Sheriff.

## Wire rule enforcement into a project

Two tool profiles, described in [Enforcement](/references/enforcement):

- **Baseline:** ESLint, Prettier, TypeScript 6. Works everywhere.
- **Fast:** oxlint, oxfmt, `tsc` 7. Enable it where it works.

Copy the templates from `skills/fma/templates/` following the table in that page.

## References

- [Angular](/references/angular)
- [NestJS](/references/nestjs)
- [Contracts and events](/references/contracts)
- [Transports and microservices](/references/transport)
- [Enforcement](/references/enforcement)
- [Migration from FDA](/references/migration)
