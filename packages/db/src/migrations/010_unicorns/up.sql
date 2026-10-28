-- The unicorns table, verbatim from upstream lib/seed.ts's CREATE TABLE
-- (the one table the template queries; app/actions.ts describes it to the
-- model in the same words).
CREATE TABLE IF NOT EXISTS unicorns (
  id SERIAL PRIMARY KEY,
  company VARCHAR(255) NOT NULL UNIQUE,
  valuation DECIMAL(10, 2) NOT NULL,
  date_joined DATE,
  country VARCHAR(255) NOT NULL,
  city VARCHAR(255) NOT NULL,
  industry VARCHAR(255) NOT NULL,
  select_investors TEXT NOT NULL
);
