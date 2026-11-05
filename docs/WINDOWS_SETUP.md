# Run Stockwise on Windows (PowerShell)

These steps assume **Node.js 22+**, **npm 10+**, **Docker Desktop** (running with Linux containers), and ports 4000–4005, 5173, 5432 and 6379 available. Keep Docker Desktop open while developing.

```powershell
# Extract Stockwise.zip, then enter its folder
cd .\smart-inventory-system

# Create your private config. Do not commit it.
Copy-Item .env.example .env
notepad .env
```

Change `JWT_SECRET` to a long random value and `ADMIN_PASSWORD` to a secure value of at least 12 characters. The PostgreSQL and Redis connection strings are configured for local development; keep the local infrastructure passwords aligned with `infra/local-services.yml`.

```powershell
# Start ONLY the PostgreSQL and Redis dependencies
# The React and six backend processes will still run directly on your laptop.
docker compose -f infra/local-services.yml up -d

# Install all npm workspaces (requires Internet access the first time)
npm install

# Create five databases and their tables; then insert demo data
npm run db:migrate
npm run db:seed

# Run six NestJS services and the React/Vite development server
npm run dev
```

Visit **http://localhost:5173**, then sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your `.env` file. The API gateway is at **http://localhost:4000/api**.

## Checks

In a **second PowerShell terminal** in the same project folder:

```powershell
docker compose -f infra/local-services.yml ps
Invoke-RestMethod http://localhost:4000/health
Invoke-RestMethod http://localhost:4000/ready
npm test
npm run test:integration
```

The integration test verifies login, product creation, stock adjustments, negative-stock rejection, low-stock alerts, recovery, cache invalidation, transfers, role permissions, and CSV. **Run it only after the seven application processes are up and databases have been migrated and seeded.** The test inserts data into the local demo database.

## Build

```powershell
npm run build
```

For a reproducible CI install after generating and committing `package-lock.json`, use `npm ci` instead of `npm install`.

## Troubleshooting

- **`Cannot reach API gateway`**: Confirm `npm run dev` is still running and nothing else owns port 4000. Visit `http://localhost:4000/health`.
- **`connect ECONNREFUSED 127.0.0.1:5432`**: Docker Desktop may be stopped, the PostgreSQL container may be unhealthy, or port 5432 may be occupied by another PostgreSQL installation.
- **Database login error**: The `.env` PostgreSQL credentials must match the local Compose service credentials. If you changed credentials after initial PostgreSQL initialization, updating `POSTGRES_PASSWORD` alone does not change the existing database user's password.
- **`EAI_AGAIN` / npm registry unavailable**: You need a working network/DNS connection to install project dependencies. The included zip intentionally does not include `node_modules`.
- **Login fails**: The seed command creates the admin account **only on its first run**. Changing the environment password afterward will not reset the existing account. Use a fresh local development database or change the password through an authorized database administration process.
- **Alerts are delayed**: Inventory stock events are published by a background outbox loop every ~3.5 seconds and processed asynchronously. Check the inventory and notification service logs and Redis connectivity.
- **Permission denied**: Admins manage users; admins and managers manage products/warehouses/transfers/exports; staff can view resources and adjust inventory.

## Clean up

```powershell
# Stop only local infrastructure containers (preserves data)
docker compose -f infra/local-services.yml down

# CAUTION: delete all local development data (including admin accounts and inventory)
docker compose -f infra/local-services.yml down -v
```

The application does not come with Dockerfiles, Jenkins pipelines, Kubernetes manifests, Terraform, or Ansible: **those are deliberately left for your DevOps assignment**.
