# Contracts and events

The shared layer between `apps/web` and `apps/api` in a monorepo. Alias: `@contracts/<domain>`.

## libs/contracts

```text
libs/contracts/src/<domain>/
  dto.ts       # requests and responses: Zod schemas + inferred types
  events.ts    # public events: name, version, payload
  index.ts     # explicit exports
```

- Allowed: Zod schemas, inferred types, identifier constants, event names and versions.
- Forbidden: classes with behavior, imports of Angular, NestJS or an ORM, dependencies on `apps/*`.
- The source of truth is the Zod schema: types for Angular and validation in NestJS are derived from one schema.
- A contract change that breaks `web` or `api` is a breaking change: new version, compatibility for the migration period.

```ts
// libs/contracts/src/cart/dto.ts
import { z } from 'zod';

export const CartItemSchema = z.object({ sku: z.string(), qty: z.number().int().positive() });
export const CartSchema = z.object({ userId: z.string(), items: z.array(CartItemSchema) });

export type CartDto = z.infer<typeof CartSchema>;
```

```ts
// libs/contracts/src/cart/index.ts
export { CartItemSchema, CartSchema } from './dto';
export type { CartDto } from './dto';
export { CartItemAddedV1 } from './events';
export type { CartItemAddedV1Payload } from './events';
```

## Events

- Name: `<domain>.<past-tense>`, for example `cart.item-added`. The version is part of the schema and of the export name (`CartItemAddedV1`).
- The payload consists of primitives and IDs only.
- `model` or `domain` of the owning domain publishes; the subscriber lives in another domain and handles the event in its own `model`.
- The event contract does not depend on the transport.
- On the client events are optional: component inputs and `state` are enough.

```ts
// libs/contracts/src/cart/events.ts
import { z } from 'zod';

export const CartItemAddedV1 = {
  name: 'cart.item-added',
  version: 1,
  schema: z.object({ cartId: z.string(), sku: z.string(), qty: z.number().int().positive() }),
} as const;

export type CartItemAddedV1Payload = z.infer<typeof CartItemAddedV1.schema>;
```
