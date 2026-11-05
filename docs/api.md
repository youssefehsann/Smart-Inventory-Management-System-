# REST API

Public API base: `http://localhost:4000/api`. Requests other than login/refresh require `Authorization: Bearer <accessToken>`. Send JSON for mutations. Gateway returns standard HTTP error codes and NestJS JSON error bodies.

## Authentication (4001)

| Method | Route | Role | Request |
|---|---|---|---|
| POST | `/auth/login` | public | `{email,password}` |
| POST | `/auth/refresh` | public | `{refreshToken}` |
| POST | `/auth/logout` | all | `{refreshToken}` |
| GET | `/auth/me` | all | — |
| PATCH | `/auth/me` | all | `{fullName}` |
| GET | `/auth/users` | admin | — |
| POST | `/auth/users` | admin | `{email,fullName,password,role}` |
| PATCH | `/auth/users/:id` | admin | `{fullName?,role?,active?}` |

## Catalog (4002)

| Method | Route | Role | Request / query |
|---|---|---|---|
| GET | `/products` | all | `page?`, `limit?` (max 100), `search?`, `categoryId?`, `ids?` |
| GET | `/products/:id` | all | — |
| POST | `/products` | admin, manager | `{sku,name,description,categoryId,supplierId,unitPrice,imageUrl}` |
| PATCH | `/products/:id` | admin, manager | Partial product |
| DELETE | `/products/:id` | admin, manager | Archive/soft delete |
| GET | `/categories` | all | — |
| POST | `/categories` | admin, manager | `{name,description}` |
| GET | `/suppliers` | all | — |
| POST | `/suppliers` | admin, manager | `{name,email,phone,contactName}` |
| PATCH | `/suppliers/:id` | admin, manager | Partial supplier |

## Inventory (4003)

| Method | Route | Role | Request / query |
|---|---|---|---|
| GET | `/warehouses` | all | — |
| POST | `/warehouses` | admin, manager | `{name,code,location}` |
| GET | `/stock` | all | `page?`, `limit?`, `warehouseId?`, `lowOnly?` |
| POST | `/stock/adjust` | all | `{productId,warehouseId,delta,reason}`; delta signed integer nonzero |
| POST | `/stock/transfer` | admin, manager | `{productId,fromWarehouseId,toWarehouseId,quantity,reason}` |
| PATCH | `/stock/reorder-level` | admin, manager | `{productId,warehouseId,reorderLevel}` |
| GET | `/low-stock` | all | — |
| GET | `/inventory/summary` | all | — |
| GET | `/inventory/trend` | all | — |
| GET | `/movements` | all | `page?`, `limit?`, `warehouseId?`, `productId?` |

## Notifications (4004)

| Method | Route | Role | Request / query |
|---|---|---|---|
| GET | `/alerts` | all | `status=open|resolved|all`, `page?`, `limit?` |
| GET | `/alerts/unread-count` | all | — |
| PATCH | `/alerts/:id/read` | all | `{}` |
| PATCH | `/alerts/:id/resolve` | admin, manager | `{}` |

## Reporting (4005)

| Method | Route | Role | Description |
|---|---|---|---|
| GET | `/reports/overview` | all | KPIs, live stock values, category distribution, movements, low stock, trend |
| GET | `/reports/exports` | admin, manager | Recent export audit entries |
| GET | `/reports/export?type=stock` | admin, manager | CSV stock snapshot |
| GET | `/reports/export?type=low-stock` | admin, manager | CSV low-stock snapshot |
| GET | `/reports/export?type=movements` | admin, manager | CSV stock movements |

## Metrics and health

Every backend has `GET /health`, `GET /ready`, `GET /metrics` on its own port. These are **internal operational endpoints**, not forwarded through `/api/*`, except the gateway's own `/health` and `/ready`. Do not expose them publicly in a production deployment.
