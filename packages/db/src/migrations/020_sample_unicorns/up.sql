-- Sample data: SIXTY FICTIONAL COMPANIES, so a fresh deployment has rows to
-- query, chart and explain. None of these companies, valuations or investors
-- is real; the names were invented for this file. Upstream loaded CB Insights'
-- list of unicorn companies from a CSV each owner downloads themselves
-- (README, "Loading CB Insights' list") — that list is CB Insights' data and is
-- not redistributed here. The rows have its shape: the columns of 010, a
-- valuation in billions, the countries and cities spelled out, the industries
-- the query prompt names (apps/web/app/actions.ts), investors as a
-- comma-separated list.
--
-- Idempotent: a company already present is left as it is (upstream's seed did
-- the same, ON CONFLICT (company) DO NOTHING). Loading the real list replaces
-- these rows (tooling/migrations/csv-to-sql.mjs writes a migration that does).
INSERT INTO unicorns (company, valuation, date_joined, country, city, industry, select_investors) VALUES
  ('Aldervane Robotics', 2.58, '2018-12-06', 'Netherlands', 'Amsterdam', 'industrials', 'Brackenfold'),
  ('Brightquill Pay', 2.55, '2018-11-14', 'United States', 'San Francisco', 'financial services', 'Copperhorn Fund, Kestrel Field Capital'),
  ('Cobaltfern Health', 2.54, '2013-06-16', 'United States', 'Austin', 'health', 'Copperhorn Fund, Starling & Vane'),
  ('Dunmere Logistics', 1.62, '2020-09-10', 'United States', 'New York', 'industrials', 'Fernhollow Capital, Quillback Ventures, Tidelark Growth'),
  ('Emberline Insure', 5.96, '2017-03-10', 'United States', 'San Francisco', 'insurance', 'Starling & Vane'),
  ('Fablewick Media', 5.51, '2018-06-28', 'United States', 'San Francisco', 'media & entertainment', 'Vellum Partners, Tidelark Growth, Moonquay Ventures'),
  ('Glasswren Analytics', 6.58, '2024-04-12', 'United States', 'Seattle', 'enterprise tech', 'Fernhollow Capital, Quillback Ventures, Kestrel Field Capital'),
  ('Hollowpine Bio', 2.73, '2023-08-04', 'United States', 'San Francisco', 'healthcare & life sciences', 'Vellum Partners, Quillback Ventures'),
  ('Ivorytide Commerce', 1.23, '2020-02-07', 'United States', 'New York', 'consumer & retail', 'Tidelark Growth, Moonquay Ventures, Orrery Partners'),
  ('Juniperlake Systems', 12.14, '2023-05-25', 'China', 'Hangzhou', 'enterprise tech', 'Halcyon Ridge, Brackenfold'),
  ('Kestrelmoor AI', 4.83, '2020-07-08', 'United States', 'New York', 'enterprise tech', 'Starling & Vane'),
  ('Lumenhollow Labs', 4.23, '2020-09-01', 'United Kingdom', 'London', 'enterprise tech', 'Moonquay Ventures, Starling & Vane, Halcyon Ridge'),
  ('Marrowgate Finance', 2.01, '2016-08-23', 'United States', 'San Francisco', 'financial services', 'Quillback Ventures'),
  ('Nettlebrook Foods', 0.95, '2016-11-25', 'China', 'Beijing', 'consumer & retail', 'Fernhollow Capital, Vellum Partners, Brackenfold'),
  ('Orchardine Mobility', 26.72, '2016-09-21', 'Sweden', 'Stockholm', 'industrials', 'Tidelark Growth'),
  ('Pebblecrest Security', 3.76, '2020-06-22', 'Indonesia', 'Jakarta', 'enterprise tech', 'Vellum Partners, Tidelark Growth, Sundial Point Capital'),
  ('Quillmarsh Data', 22.63, '2012-11-06', 'Germany', 'Munich', 'enterprise tech', 'Kestrel Field Capital'),
  ('Rookhaven Energy', 40.14, '2019-03-24', 'United Kingdom', 'London', 'industrials', 'Fernhollow Capital, Brackenfold'),
  ('Saffronvale Retail', 10.61, '2019-09-01', 'China', 'Shanghai', 'consumer & retail', 'Fernhollow Capital, Sundial Point Capital, Quillback Ventures'),
  ('Thistlecove Learning', 10.88, '2018-06-27', 'United States', 'New York', 'enterprise tech', 'Quillback Ventures, Moonquay Ventures'),
  ('Umberfield Cloud', 27.60, '2017-05-16', 'Canada', 'Toronto', 'enterprise tech', 'Brackenfold'),
  ('Velvetmoss Gaming', 1.58, '2023-02-25', 'Germany', 'Berlin', 'media & entertainment', 'Starling & Vane'),
  ('Willowstep Care', 1.87, '2018-07-13', 'United States', 'San Francisco', 'health', 'Moonquay Ventures, Vellum Partners'),
  ('Yarrowbank Lending', 1.14, '2017-09-26', 'Australia', 'Sydney', 'financial services', 'Orrery Partners'),
  ('Zephyrine Freight', 6.38, '2019-12-20', 'India', 'Bengaluru', 'industrials', 'Kestrel Field Capital'),
  ('Ashgrove Genomics', 26.12, '2020-11-09', 'United States', 'San Francisco', 'healthcare & life sciences', 'Sundial Point Capital, Vellum Partners, Copperhorn Fund'),
  ('Bramblewood Pay', 1.33, '2021-03-12', 'United Kingdom', 'London', 'financial services', 'Brackenfold, Vellum Partners'),
  ('Cinderfjord Studio', 8.56, '2024-07-10', 'China', 'Shanghai', 'media & entertainment', 'Copperhorn Fund'),
  ('Driftmere Insure', 3.27, '2017-01-14', 'China', 'Shenzhen', 'insurance', 'Halcyon Ridge, Copperhorn Fund'),
  ('Elmstone Devices', 3.90, '2023-11-18', 'China', 'Beijing', 'industrials', 'Kestrel Field Capital'),
  ('Foxglen Wealth', 2.49, '2021-07-10', 'United States', 'Boston', 'financial services', 'Copperhorn Fund, Quillback Ventures'),
  ('Gildermoor Health', 8.16, '2021-06-24', 'Israel', 'Tel Aviv', 'health', 'Tidelark Growth'),
  ('Heatherpike Retail', 1.08, '2023-10-18', 'United States', 'New York', 'consumer & retail', 'Sundial Point Capital, Quillback Ventures'),
  ('Inkwell Harbor', 43.56, '2016-10-21', 'India', 'Bengaluru', 'enterprise tech', 'Halcyon Ridge, Copperhorn Fund, Vellum Partners'),
  ('Jadecliff Motors', 19.11, '2023-08-23', 'United States', 'San Francisco', 'industrials', 'Copperhorn Fund, Orrery Partners, Kestrel Field Capital'),
  ('Kindlewood Homes', 1.04, '2013-11-13', 'United States', 'Palo Alto', 'consumer & retail', 'Halcyon Ridge, Quillback Ventures, Copperhorn Fund'),
  ('Larkspire Ledger', 4.16, '2013-06-08', 'United States', 'New York', 'financial services', 'Brackenfold'),
  ('Mossbury Clinics', 1.66, '2021-08-06', 'France', 'Paris', 'health', 'Quillback Ventures'),
  ('Nimbleheron Ops', 16.32, '2014-08-17', 'India', 'Mumbai', 'enterprise tech', 'Sundial Point Capital'),
  ('Oakenshaw Grid', 2.01, '2017-05-08', 'South Korea', 'Seoul', 'industrials', 'Tidelark Growth, Fernhollow Capital'),
  ('Pinecrest Atlas', 2.19, '2012-10-05', 'United States', 'New York', 'enterprise tech', 'Halcyon Ridge'),
  ('Quartzbay Chips', 3.30, '2019-06-27', 'Japan', 'Tokyo', 'industrials', 'Moonquay Ventures, Kestrel Field Capital'),
  ('Ravenmere Audio', 20.41, '2023-03-04', 'United States', 'San Francisco', 'media & entertainment', 'Quillback Ventures'),
  ('Silverbirch Credit', 2.78, '2015-08-23', 'Singapore', 'Singapore', 'financial services', 'Quillback Ventures, Copperhorn Fund'),
  ('Tanglewood Supply', 2.00, '2022-03-28', 'France', 'Paris', 'industrials', 'Orrery Partners, Copperhorn Fund'),
  ('Underhill Therapeutics', 34.43, '2013-02-15', 'Brazil', 'Sao Paulo', 'healthcare & life sciences', 'Kestrel Field Capital, Brackenfold, Sundial Point Capital'),
  ('Vintermarsh Travel', 16.58, '2023-07-09', 'Netherlands', 'Amsterdam', 'consumer & retail', 'Starling & Vane, Vellum Partners'),
  ('Wrenfield Robotics', 24.44, '2013-09-14', 'United States', 'San Francisco', 'industrials', 'Fernhollow Capital'),
  ('Amberquay Markets', 15.91, '2015-08-06', 'United States', 'Austin', 'financial services', 'Sundial Point Capital, Moonquay Ventures'),
  ('Bluefennel Diagnostics', 4.46, '2020-06-23', 'United States', 'New York', 'healthcare & life sciences', 'Fernhollow Capital, Orrery Partners'),
  ('Copperwick Payroll', 19.18, '2017-10-02', 'United States', 'San Francisco', 'financial services', 'Moonquay Ventures'),
  ('Dewcastle Foods', 7.53, '2016-08-16', 'United States', 'San Francisco', 'consumer & retail', 'Kestrel Field Capital'),
  ('Evenmoor Satellites', 1.57, '2012-08-28', 'United States', 'Seattle', 'industrials', 'Fernhollow Capital'),
  ('Ferncastle Insure', 15.59, '2020-08-10', 'United States', 'San Francisco', 'insurance', 'Moonquay Ventures'),
  ('Gorsehill Learning', 1.06, '2017-12-26', 'United States', 'New York', 'enterprise tech', 'Fernhollow Capital, Starling & Vane, Brackenfold'),
  ('Hazelmont Biotech', 10.19, '2017-10-07', 'China', 'Hangzhou', 'healthcare & life sciences', 'Tidelark Growth, Starling & Vane, Vellum Partners'),
  ('Ironquill Software', 12.23, '2024-10-09', 'United States', 'New York', 'enterprise tech', 'Tidelark Growth, Orrery Partners'),
  ('Jasperlynn Fashion', 9.98, '2018-09-13', 'United Kingdom', 'London', 'consumer & retail', 'Sundial Point Capital'),
  ('Kelpstone Ocean', 1.12, '2019-06-08', 'United States', 'San Francisco', 'industrials', 'Quillback Ventures'),
  ('Lindenshade Pharma', 7.98, '2019-03-11', 'China', 'Beijing', 'healthcare & life sciences', 'Vellum Partners, Quillback Ventures, Orrery Partners')
ON CONFLICT (company) DO NOTHING;
