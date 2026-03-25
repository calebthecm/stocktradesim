/*
  # Create orders table for pending orders

  1. New Tables
    - `orders`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `symbol` (text)
      - `type` (text) - 'market', 'limit', 'stop_loss', 'stop_loss_limit'
      - `side` (text) - 'buy' or 'sell'
      - `quantity` (numeric)
      - `price` (numeric) - execution price for market, limit price for limit/stop
      - `stop_price` (numeric) - trigger price for stop loss orders
      - `status` (text) - 'pending', 'filled', 'cancelled'
      - `created_at` (timestamp)
      - `filled_at` (timestamp)
  2. Security
    - Enable RLS on `orders` table
    - Users can only view their own orders
*/

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  type text NOT NULL CHECK (type IN ('market', 'limit', 'stop_loss', 'stop_loss_limit')),
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity numeric NOT NULL,
  price numeric NOT NULL,
  stop_price numeric,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  filled_at timestamptz
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders"
  ON orders
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own orders"
  ON orders
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own orders"
  ON orders
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_symbol ON orders(symbol);
