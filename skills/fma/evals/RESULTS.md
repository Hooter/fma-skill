# Eval run results (2026-10-13)

Each case was run by a separate subagent (Sonnet) with the skill installed: it read `SKILL.md` and the references and answered the user's task. Answers are graded by `scripts/grade-evals.mjs`: the required words from `expect.mentions`, the absence of `expect.forbid` outside lines with a negation, and a mention of `arch:check`. The grading checks for the presence of phrases, not for the quality of the solution; the answers were also reviewed manually.

> Note: this run used the original Russian-language version of the skill, prompts and expectations. The skill, the eval prompts and the grader were translated to English afterwards and have not been re-run.

## Summary: 11 of 11

| Case | Result |
|---|---|
| ng-simple-domain | PASS |
| ng-rich-domain | PASS |
| ng-subdomain | PASS |
| ng-review-violation | PASS |
| ng-cross-domain-ui | PASS |
| nest-simple-domain | PASS |
| nest-rich-domain | PASS |
| nest-subdomain | PASS |
| nest-cross-domain-call | PASS |
| nest-review-violation | PASS |
| nest-consumer-outbox | PASS (after fixing `transport.md`) |

## What the run showed

First run: 2 of 11 under strict grading, 7 of 11 once negations were taken into account. Reasons for the remaining failures:

1. **A gap in the skill (fixed).** `nest-consumer-outbox`: the agent created an `OutboxPort` instead of `EventPublisher`, because `transport.md` did not link the port and the outbox. Added: a single `EventPublisher` port, with the adapters `OutboxEventPublisher` (use case) and `KafkaEventPublisher` (relay); the code example was aligned. Re-run of the case: PASS, the design uses both adapters.
2. **Overly strict expectations in the cases (fixed; decided after reviewing the results).**
   - `ng-rich-domain`: dropped the `InjectionToken` requirement. The agent deliberately did not create a port: `model` has no storage, and the discount rules live entirely in `domain/`.
   - `ng-cross-domain-ui`: "component inputs" was replaced with "inputs"; the ban on the name `CartState` was replaced with a ban on deep imports (`from '@app/cart/`, `from '../cart/`).
   - `nest-cross-domain-call`: the ban on the names `CartController` and `cart.service` was replaced with a ban on deep imports; those files are needed inside the `cart` module itself.
3. **The grader (fixed).** An explanation of a ban ("without export *", "I do not create domain/") was counted as a violation. Lines with a negation are now ignored (test in `grade-evals.test.mjs`).

## Decisions made after the run

- In `nest-consumer-outbox` the agent pointed out that `OutboxEventPublisher` lives in `shared/outbox` while the `EventPublisher` port belonged to the `cart` domain; `shared` cannot import a domain (`shared-no-domain`). Decision (option A): two kinds of ports. An infrastructure port (shared types only: `EventPublisher`, clock, mail) and its adapters live in `shared/<segment>`; a domain port (it has domain types) lives in the domain's `ports/` and is implemented there. No exception was made for `shared`. `nest-consumer-outbox` was re-run expecting `shared/events`: PASS, the agent placed `EventPublisher` in `shared/events`, the adapters in `shared/outbox` and `shared/kafka`, and imported through `@shared/events`.

## Open questions

- A single pass on a single model: the spread of answers between runs was not measured.
