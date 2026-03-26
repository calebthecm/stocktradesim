-- 1. Add display_name to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;

-- 2. Add short_entry_price to portfolios (tracks short position VWAP entry price)
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS short_entry_price numeric;

-- 3. Add take_profit to orders type check
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_type_check
  CHECK (type IN ('market', 'limit', 'stop_loss', 'stop_loss_limit', 'take_profit'));

-- 4. Add bracket_id for linking TP + SL legs of a bracket order
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bracket_id uuid;
CREATE INDEX IF NOT EXISTS idx_orders_bracket_id ON orders(bracket_id);

-- 5. Allow authenticated users to read leaderboard data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Users can read leaderboard data'
  ) THEN
    CREATE POLICY "Users can read leaderboard data"
      ON users FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- 6. Allow users to update their own display_name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Users can update own display_name'
  ) THEN
    CREATE POLICY "Users can update own display_name"
      ON users FOR UPDATE TO authenticated
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid());
  END IF;
END $$;
