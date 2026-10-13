---
layout: home
hero:
  name: FMA
  text: Fractal Module Architecture
  tagline: An agent skill for Angular and NestJS, with machine-checked architecture rules.
  actions:
    - theme: brand
      text: Guide
      link: /guide
    - theme: alt
      text: GitHub
      link: https://github.com/Hooter/fma-skill
features:
  - title: Layers and tiers
    details: ui → state → api → model → repo, plus an optional domain layer (the rich tier).
  - title: Explicit boundaries
    details: A module is visible to neighbors only through index.ts; ports and events for everything else.
  - title: Enforced by tools
    details: arch:check runs ESLint or oxlint, dependency-cruiser and Sheriff from ready-made templates.
---
