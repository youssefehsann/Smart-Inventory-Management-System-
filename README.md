# Stockwise — Smart Inventory Management System

A **React + Node.js (NestJS) + PostgreSQL + Redis** full-stack inventory management project, intentionally structured for a DevOps team to containerize, deploy, automate, and monitor. A professional dashboard sits on top of **six independent backend microservices**.

> **Implementation status:** Application source, schemas, seed data, UI pages, metrics, and integration test scripts are provided. A complete `npm install` / application boot / database-backed end-to-end run **has not been performed** in the creation environment because npm registry access and local PostgreSQL/Redis are unavailable. Perform the verification steps below before calling a deployment production-ready.

## Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, custom reusable component primitives, Recharts, TanStack Query, Lucide icons.
- **Backend:** NestJS 10, TypeScript, REST, JSON Web Tokens, Zod input validation.
- **Database:** PostgreSQL 16, five separate service-owned databases, parameterized SQL, explicit migrations.
- **Cache & events:** Redis 7, ioredis catalog cache with version-key invalidation, BullMQ jobs, PostgreSQL transactional outbox.
- **Observability:** `/health`, `/ready`, `/metrics` per service; Prometheus-compatible counters, durations, and Node metrics.
- **Testing:** Node's built-in test runner; source checks and a real cross-service integration test.

## Services

| Component | Port | Database | Responsibilities |
|---|---:|---|---|
| API Gateway | 4000 | None | Single public API, fixed-route reverse proxy, JWT validation, Redis rate limiting |
| Authentication | 4001 | `smart_auth` | Login, refresh-token rotation, user roles, user management, profile |
| Catalog | 4002 | `smart_catalog` | Products, categories, suppliers, Redis-cached listing |
| Inventory | 4003 | `smart_inventory` | Warehouses, stock, atomic adjustments, transfers, reorder levels, audit history, outbox |
| Notifications | 4004 | `smart_notifications` | Low-stock alerts, read/resolve, durable background consumer |
| Reporting | 4005 | `smart_reporting` | Cross-service KPIs, stock charts, CSV exports, export audit history |
| React web | 5173 | None | Admin dashboard and management interface |

### Start locally (Node.js 22+, Docker or a local PostgreSQL/Redis installation)

```bash
# From the repository root
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env
# Edit .env: especially ADMIN_EMAIL, ADMIN_PASSWORD and JWT_SECRET

docker compose -f infra/local-services.yml up -d
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Visit **http://localhost:5173** and log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

The seed operation creates an admin account, two warehouses, five categories, a supplier, eight example products, opening stock movements, and low-stock outbox events. It can be rerun without replacing the initial admin password or duplicating opening stock.

`npm run dev` builds the shared package and runs six independent Nest processes plus the Vite development server. The workspace scripts use `cross-env` and load the shared root `.env`, so they work from PowerShell as well as Bash. Each web request goes to `/api/*`; Vite forwards it to port 4000.

**Production warning:** `.env.example` contains development-only passwords/URLs. Never commit `.env`, expose PostgreSQL/Redis to the Internet, or leave the sample JWT secret in a deployed system. Use infrastructure secret management. The authentication and authorization model is designed for a training application, not as an audited identity platform.

### Build and tests

```bash
npm run build          # Compile shared package, six backend services, and React
npm test               # Deterministic structural checks; integration suite skipped by default
npm run test:integration # Requires all services running, migrated + seeded databases
```

`test:integration` creates its own product and verifies real authentication, stock consistency, negative-stock rejection, asynchronous low-stock alert, automatic recovery, Redis cache invalidation, warehouse transfers, role permissions, reports and CSV. A single test run may generate additional test data, as expected. It uses the admin configured in `.env`.

### Architecture

```text
  Browser / React Vite (5173)
              |
         /api/* via Vite proxy
              |
  API Gateway / rate-limit / JWT (4000)
    |          |              |            |             |
    v          v              v            v             v
  Auth       Catalog      Inventory    Notifications   Reporting
  (4001)     (4002)        (4003)       (4004)         (4005)
    |          |              |            |              |
 smart_auth  smart_catalog smart_inventory smart_notifications smart_reporting
               |              |            ^               |
           Redis cache     PG outbox → Redis/BullMQ queue      |
                              |                            HTTP
                            events        ← inventory, catalog, notifications
```

- Each stateful service owns **its own database**; cross-service foreign keys are intentionally absent.
- The API Gateway checks signed access tokens and forwards the original JWT to downstream services; business services also independently verify JWTs and role permissions.
- Inventory uses a PostgreSQL transaction and row/advisory locks. An adjustment **cannot** drive quantity below zero; transfers update both locations atomically.
- State changes and events commit together in the inventory DB. A periodic dispatcher sends pending outbox events to BullMQ, retrying Redis outages; the notification worker consumes and deduplicates events.
- Product list caching uses a Redis version key incremented on product modifications, avoiding stale pages after writes.
- Reports aggregate data through service HTTP APIs and log export events in their own database.
- Dashboard data is fetched from real APIs; it refreshes approximately every 15 seconds (**polling**, not WebSocket push).
- Example product photos are optional remote Unsplash URLs. Application business logic does not depend on them.

See [`docs/architecture.md`](docs/architecture.md) for service interactions and [`docs/api.md`](docs/api.md) for routes. **Windows users:** follow [`docs/WINDOWS_SETUP.md`](docs/WINDOWS_SETUP.md) for PowerShell setup, verification, and troubleshooting.

## DevOps team handoff

The repository **does not include completed application Dockerfiles, a Jenkinsfile, Kubernetes manifests, Grafana dashboards, Terraform plans, or Ansible playbooks**, intentionally leaving those as your course deliverables. `infra/local-services.yml` starts **only PostgreSQL and Redis locally** for app development.

Suggested implementation sequence:

1. Write a multi-stage **Dockerfile for each backend** and one for **React served by Nginx**, taking care that the shared `@smart/common` workspace is built before backend images.
2. Add a **Jenkins CI/CD pipeline**: install/lock dependencies, build, test, scan, publish 7 versioned images, then promote to your environment. Generate a lockfile by running `npm install` and commit it.
3. Create **Kubernetes Deployments and Services** for all seven apps; keep internal services private and expose only the ingress/gateway. Configure liveness `/health` and readiness `/ready` probes. Use Secrets for credentials and ConfigMaps for service URLs.
4. Configure **Prometheus** scraping all six `/metrics` endpoints and use **Grafana** to visualize request counts, request latency, process memory and service health.
5. Use **Terraform** to provision AWS VPC, private subnets, security groups, and EC2 instances or a Kubernetes environment. Use **S3** for Terraform state and optionally reports/assets (adding S3 report storage would require application integration).
6. Use **Ansible** to configure instances, prerequisites, monitoring agents, and deployment dependencies.
7. Build an **Nginx** ingress/reverse-proxy configuration with TLS, suitable request limits, and sensible headers.

### Kubernetes-specific notes

- The app's database/Redis localhost values are **development defaults**. Supply correct DNS addresses in Pod environment variables.
- Do not expose service ports 4001–4005 outside the cluster. These can be reached only by the gateway and authorized peer services.
- Prefer managed stateful storage or appropriate PersistentVolumes; do not deploy PostgreSQL as an ephemeral container in production.
- Monitor BullMQ jobs and inventory outbox backlog. The single notification worker's ordering is appropriate for a local demonstration; multi-replica ordering across the same product requires a stricter per-entity ordering strategy.
- CORS comes from `FRONTEND_ORIGIN`; update it when Nginx serves the frontend at your domain.

## Known limitations / next verification steps

- No runtime boot or full integration test has been executed here (npm registry access was unavailable). **Run `npm install`, `npm run build`, `npm run dev`, and `npm run test:integration` locally.** Fix any dependency/version or environment mismatch encountered.
- Alerts appear asynchronously (usually within a few seconds); dashboard refresh uses polling. This is not true push-based realtime.
- Reports list all pages of catalog and inventory up to 10,000 rows per collection; increase or stream exports for larger-scale deployments.
- No payment processing, barcode scanning, warehouse physical sensors, user invitations by email, audit log export retention, or S3 uploads are implemented. These were not required for the inventory/DevOps assignment.
- Redis rate limiting is basic per gateway instance; production should use trusted proxies, token-aware limits, and threat monitoring.
- For high-scale deployments, improve event ordering, add persistent retry/dead-letter dashboards, centralized logs, and contract testing.

## License

MIT. This code is intended as a foundation for a DevOps portfolio/course project.
