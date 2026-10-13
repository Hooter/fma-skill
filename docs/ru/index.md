---
layout: home
hero:
  name: FMA
  text: Fractal Module Architecture
  tagline: Skill для агентов, работающих с Angular и NestJS, с автоматической проверкой правил архитектуры.
  actions:
    - theme: brand
      text: Руководство
      link: /ru/guide
    - theme: alt
      text: GitHub
      link: https://github.com/Hooter/fma-skill
features:
  - title: Слои и ярусы
    details: ui → state → api → model → repo и необязательный слой domain (ярус rich).
  - title: Явные границы
    details: Модуль виден соседям только через index.ts; для остального — порты и события.
  - title: Правила проверяются машиной
    details: arch:check запускает ESLint или oxlint, dependency-cruiser и Sheriff по готовым шаблонам.
---
