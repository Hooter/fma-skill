# Transports and microservices (extension)

The FMA core does not depend on this file. The recommended path is a **modular monolith with events and ports, then extracting services**. Infrastructure code (brokers, relay, schema registry) is not part of the skill — only rules and examples.

## Inbound adapters

A `*.consumer.ts` (`@EventPattern` / `@MessagePattern`) appears next to `*.controller.ts`. It is the same `api` layer: it validates the message with a schema from `@contracts/<domain>` and calls one use case.

```ts
// orders/orders.consumer.ts
import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { CartItemAddedV1 } from '@contracts/cart';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersConsumer {
  constructor(private readonly orders: OrdersService) {}

  @EventPattern(CartItemAddedV1.name)
  async onItemAdded(@Payload() raw: unknown): Promise<void> {
    const event = CartItemAddedV1.schema.parse(raw);
    await this.orders.reserveStock(event);
  }
}
```

## Outbound messages

`model` calls the `EventPublisher` port. It is an infrastructure port: its signature contains only the generic event envelope, no domain types. So the port and its RabbitMQ and Kafka adapters live in `shared/events` and `shared/<segment>` and are imported as `@shared/events`. Only the adapter knows about the transport.

```ts
// shared/events/event-publisher.port.ts (exported from shared/events/index.ts)
export interface DomainEventEnvelope {
  id: string;
  name: string;
  version: number;
  payload: unknown;
}

export abstract class EventPublisher {
  abstract publish(event: DomainEventEnvelope): Promise<void>;
}
```

There is one `EventPublisher` port and two adapters (details in the "Reliability" section):

- `OutboxEventPublisher` — the adapter `model` uses: it writes the event to an outbox table in the same transaction as the data. It does not write to the broker.
- `KafkaEventPublisher` (or `RabbitEventPublisher`) — the adapter the relay uses: it sends outbox records to the broker.

`model` knows only the `EventPublisher` port; a use case never writes to the broker directly. Infrastructure folders (`events/`, `outbox/`, `kafka/`) live in `shared/<segment>/` with their own `index.ts`, not at the application root: any folder at the root counts as a domain. Domain ports (for example `CartPort` in the next section) stay in the domain's `ports/` and are implemented there: an adapter from `shared` cannot implement a domain port.

## Calling a neighbor

The consumer depends on a **port** in its own `ports/`; the implementation is a local `facade` (monolith) or a remote client (services). The shape of the dependency does not change.

```ts
// orders/ports/cart.port.ts
import type { CartSummaryDto } from '@contracts/cart';

export abstract class CartPort {
  abstract getSummary(userId: string): Promise<CartSummaryDto>;
}
// monolith:  { provide: CartPort, useExisting: CartFacade }
// services:  { provide: CartPort, useClass: CartHttpClient }
```

## Contracts by owner

- Each service owns the contracts of its domain; the others only read them.
- Event contracts are the public API between services; versioning is mandatory.
- Kafka: a schema registry (Avro or Protobuf) is an option; RabbitMQ: Zod schemas are enough.
- Data belongs to a service: never read another service's DB, only through an event or a request.
- Transactions: a unit of work applies inside one service; between services use sagas or compensations.

## Reliability

Delivery is at-least-once, so the following are mandatory:

1. **Outbox:** the use case calls the `EventPublisher` port, its `OutboxEventPublisher` adapter writes the event in the same transaction as the data; a separate process (relay) publishes the records to the broker through `KafkaEventPublisher`.
2. **Idempotent consumer:** deduplicate by message ID (an inbox table or a unique key).
3. **Ordering:** for Kafka the partition key is the aggregate ID; for RabbitMQ ordering is guaranteed only within one queue with one consumer.
4. **Retry and a dead-letter queue** for messages that could not be processed.

```ts
// cart/cart.service.ts (excerpt: event through the EventPublisher port, in the same transaction as the data)
await this.tx.run(async () => {
  await this.carts.save(cart);
  // EventPublisher here is OutboxEventPublisher: it writes to the outbox within the same transaction
  await this.events.publish({
    id: randomUUID(),
    name: CartItemAddedV1.name,
    version: CartItemAddedV1.version,
    payload,
  });
});
```

## Monorepo layout

Each service of the monorepo is a separate FMA application (`arch:check --api <dir>` is repeatable, or `--services`). Between services only RPC, HTTP or events cross the boundary; a service never imports another service's `src`, only `libs/*`. This rule is not automated.

```text
apps/
  web/                 # Angular
  cart-svc/            # NestJS service: cart domain
  orders-svc/          # NestJS service: orders domain
libs/
  contracts/src/<domain>/   # owner — the service of that domain
```

- Instead of a single `apps/api` there is `apps/<service>`.
- Services depend on each other only through `libs/contracts`, never through code.
- The rule "services depend on each other only through `libs/contracts`" is not yet checked by the `templates/` files. When you move to services, add a dependency-cruiser rule forbidding imports from `apps/<other-service>/` (the boundary is the `apps/<service>` folder).
