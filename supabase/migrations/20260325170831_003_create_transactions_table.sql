/*
  # Create transactions table for trade history

  1. New Tables
    - `transactions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `symbol` (text)
      - `type` (text) - 'buy' or 'sell'
      - `quantity` (numeric)
      - `price` (numeric)
      - `total_cost` (numeric)
      - `created_at` (timestamp)
  2. Security
    - Enable RLS on `transactions` table
    - Users can only view their own transactions
*/

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  type text NOT NULL CHECK (type IN ('buy', 'sell')),
  quantity numeric NOT NULL,
  price numeric NOT NULL,
  total_cost numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON transactions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own transactions"
  ON transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_symbol ON transactions(symbol);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
