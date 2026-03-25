/*
  # Create watchlist table for user monitoring

  1. New Tables
    - `watchlist`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `symbol` (text)
      - `created_at` (timestamp)
  2. Security
    - Enable RLS on `watchlist` table
    - Users can only manage their own watchlist
*/

CREATE TABLE IF NOT EXISTS watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, symbol)
);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watchlist"
  ON watchlist
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can add to watchlist"
  ON watchlist
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove from watchlist"
  ON watchlist
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_watchlist_user_id ON watchlist(user_id);
