-- Market prices table: server-authoritative price for each symbol.
-- Updated every ~10s by the tick-market Edge Function.
-- All clients subscribe via Supabase Realtime for live updates.

CREATE TABLE IF NOT EXISTS market_prices (
  symbol       TEXT          PRIMARY KEY,
  price        NUMERIC(12,4) NOT NULL,
  day_open     NUMERIC(12,4) NOT NULL,
  day_high     NUMERIC(12,4) NOT NULL,
  day_low      NUMERIC(12,4) NOT NULL,
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- RLS: anyone can read, only service role can write (bypasses RLS)
ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_prices_public_read"
  ON market_prices FOR SELECT
  USING (true);

-- Enable Realtime so clients receive live UPDATE events
ALTER PUBLICATION supabase_realtime ADD TABLE market_prices;
