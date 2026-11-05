CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY, name TEXT NOT NULL UNIQUE, code TEXT NOT NULL UNIQUE,
  location TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS stock (
  product_id UUID NOT NULL, warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0), reorder_level INTEGER NOT NULL DEFAULT 10 CHECK(reorder_level >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(product_id,warehouse_id)
);
CREATE TABLE IF NOT EXISTS movements (
  id UUID PRIMARY KEY, product_id UUID NOT NULL, warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  delta INTEGER NOT NULL, after_quantity INTEGER NOT NULL CHECK(after_quantity >= 0),
  reason TEXT NOT NULL, reference_id UUID, actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS movements_created_idx ON movements (created_at DESC);
CREATE TABLE IF NOT EXISTS outbox (
  id UUID PRIMARY KEY, name TEXT NOT NULL, payload JSONB NOT NULL,
  published_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox(created_at) WHERE published_at IS NULL;
