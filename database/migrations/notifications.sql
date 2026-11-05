CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY, product_id UUID NOT NULL, warehouse_id UUID NOT NULL,
  title TEXT NOT NULL, message TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'warning',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE, source_event_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts(status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS alerts_one_open_per_product_warehouse ON alerts(product_id,warehouse_id) WHERE status='open';
