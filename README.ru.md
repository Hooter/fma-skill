# fma-skill

> English version: [README.md](README.md)

FMA (Fractal Module Architecture) — skill для AI-агентов, работающих с Angular и NestJS; форк идеи FDA (`chord-ts/fda`). Skill даёт агенту правила архитектуры (слои, ярусы, порты, события, контракты) и поставляется с шаблонами, которые проверяют эти правила автоматически.

Сам skill (`skills/fma/`) написан на английском языке, чтобы его можно было опубликовать и использовать с любым агентом. Этот файл — русскоязычное описание: что внутри и как этим пользоваться.

Документация: https://hooter.github.io/fma-skill/ru/ (русская и английская версии). Локально: `pnpm docs:dev`.

## Что делает skill

Агент загружает `SKILL.md` и по типу приложения подтягивает справочник:

- `apps/web` (Angular) — `references/angular.md`;
- `apps/api` (NestJS) — `references/nestjs.md`.

Основные идеи FMA:

- **Фрактальность:** структура модуля повторяется на уровне подмодуля и домена.
- **Слои:** `ui → state → api → model → repo`, плюс необязательный `domain` (ярус `rich`). Матрица разрешённых зависимостей — в `SKILL.md`.
- **Публичный вход:** модуль виден соседям только через `index.ts` (и `exports` в NestJS); `export *` запрещён.
- **Порты:** вызов соседа и внешних систем оформляется через порт. Доменный порт лежит в домене, инфраструктурный (события, часы, почта) — в `shared/<segment>`.
- **Ярусы:** `simple` по умолчанию; `rich` — когда в домене есть инварианты (признак: папка `domain/`).
- **Правила проверяются машиной:** команда `arch:check` запускает линтер, dependency-cruiser и Sheriff.

## Состав skill

| Файл | Назначение |
|---|---|
| `SKILL.md` | принципы, словарь, ярусы, матрица зависимостей, чек-лист из 14 пунктов |
| `references/angular.md` | структура и правила домена в Angular |
| `references/nestjs.md` | структура и правила домена в NestJS |
| `references/contracts.md` | `libs/contracts` (Zod-схемы) и события |
| `references/transport.md` | RabbitMQ/Kafka, outbox, переход к микросервисам |
| `references/enforcement.md` | инструменты проверки, хук перед коммитом, CI, известные ограничения |
| `references/migration.md` | переход с оригинального FDA |
| `templates/` | конфиги ESLint, oxlint, Prettier, oxfmt, dependency-cruiser, Sheriff, lefthook, скрипты `arch-check.mjs` и `rewrite-imports.mjs` (перенос файлов с переписыванием импортов), шаблон теста метаданных сущностей |
| `evals/` | сценарии проверки skill и результаты прогона |

## Установка skill

Скопировать `skills/fma/` в `.agents/skills/fma/` (или `~/.claude/skills/fma/`) проекта.

## Проверка репозитория

```bash
pnpm install
pnpm test        # валидатор, evals, конфиги проверки на фикстурах
pnpm validate    # структура skill
```

## Подключение проверки правил в проект

Два профиля инструментов (подробно в `skills/fma/references/enforcement.md`):

- **Базовый:** ESLint, Prettier, TypeScript 6. Основной, работает везде.
- **Ускоренный:** oxlint, oxfmt, `tsc` 7. Подключается там, где работает.

Шаблоны из `skills/fma/templates/` копируются по таблице в `enforcement.md`. `arch:check` выбирает линтер флагом `--linter eslint|oxlint`. Для реальных проектов есть флаги `--api` (повторяемый), `--api-root`/`--web-root`, `--non-domains`, `--infra-dirs`, `--tsconfig`, `--services`, `--report` и `--json` (подробно в `enforcement.md`).

TypeScript: dependency-cruiser, Sheriff и typescript-eslint требуют JS API TypeScript 6, а в TypeScript 7.0 его нет. Под именем `typescript` ставится `npm:@typescript/typescript6`, а TypeScript 7 (`tsc`) — отдельным алиасом `@typescript/native`.

## Структура репозитория

```text
skills/fma/            сам skill: SKILL.md, references/, templates/, evals/
scripts/               валидаторы skill и evals, оценщик ответов (с тестами)
tests/enforcement/     тесты шаблонов проверки на проектах-фикстурах
```

## Примечание о evals

Результаты прогона в `skills/fma/evals/RESULTS.md` получены на исходной русскоязычной версии skill. После перевода на английский сценарии и оценщик обновлены, но прогон агентом не повторялся.
