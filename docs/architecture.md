# Architecture & service boundaries

## Bounded contexts

The six backend services are separate NestJS processes. They communicate over REST inside the trusted environment. The frontend reaches them only through the API Gateway. Each data-owning service uses an independent PostgreSQL database, so APIs and events—not cross-database SQL joins—are the inter-service contract.

| Service | Owns | Inbound dependencies |
|---|---|---|
| Gateway | Request routing, JWT verification, IP rate limits | Redis, all HTTP services |
| Authentication | Users, hashed passwords, refresh-token records | PostgreSQL |
| Catalog | Products, categories, suppliers | PostgreSQL, Redis cache |
| Inventory | Warehouses, stock, movements, outbox | PostgreSQL, Catalog API, Redis/BullMQ |
| Notifications | Alerts and resolution history | PostgreSQL, Redis/BullMQ |
| Reporting | Export audit log | PostgreSQL, Catalog + Inventory + Notifications APIs |

## Consistency on stock adjustments

1. Client submits a signed stock adjustment to the gateway.
2. The Inventory Service asks Catalog to validate that the product is active.
3. Inventory begins a database transaction, serializes operations for the product/warehouse, locks the stock row, verifies the resulting quantity is nonnegative, updates stock and appends a movement.
4. If a low-stock threshold was crossed, it inserts an event into the outbox *in the same transaction*.
5. Only after a successful commit does the periodic outbox publisher add the event to a Redis BullMQ queue.
6. The Notification worker stores or resolves the alert. The alert table has a unique event ID and a unique partial index preventing concurrent duplicate open alerts for the same stock line.
7. The React dashboard polls the reporting endpoint and refreshes the affected views.

This is *eventual consistency* between Inventory and Notifications. The inventory update itself is transactional; the message and downstream alert are retried separately. Redis queue retention is configured with completed-job age/count limits.

## Cache behavior

Catalog product list responses are cached for 30 seconds under a versioned Redis key. A create/update/archive increments the shared cache version, instantly invalidating old list keys. Redis errors fail open for catalog list caching: PostgreSQL remains authoritative.

## Safety, scalability, and availability

- **Auth:** Access tokens expire in 15 minutes. Refresh tokens rotate on refresh and are stored only as SHA-256 hashes in the database. Passwords use bcrypt with a work factor of 12.
- **Authorization:** Admin manages users; manager manages catalog, alerts, warehouses and inventory; staff can view and perform stock adjustments but not transfers, role changes or exports.
- **Network:** Only gateway and frontend should be exposed publicly. Internal services still verify JWTs but should also be protected with Kubernetes NetworkPolicies.
- **Health:** `/health` is process liveness; `/ready` checks database reachability (gateway checks Redis). Exposed `/metrics` includes Prometheus request metrics and process defaults.
- **Scaling:** Catalog and gateway can scale horizontally. The inventory outbox dispatcher uses `FOR UPDATE SKIP LOCKED` for safe concurrent dispatch. For a production system, constrain event order per stock key when scaling notification workers beyond one replica.
- **Dependencies:** PostgreSQL and Redis are stateful; production persistence, backups, TLS, secret rotation, and resource limits belong to the DevOps implementation.
