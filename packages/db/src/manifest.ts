import type { MigrationManifest } from "./types.js";

// Every migration the runner applies, in order, with the sha256 of its file.
// `pnpm --filter @saas/db run manifest:check` verifies the checksums;
// `manifest:fix` rewrites them after a migration file changes (only ever
// before that migration has been applied anywhere — an applied migration's
// checksum is immutable).
export const manifest: MigrationManifest = {
  version: 1,
  migrations: [
    {
      id: "000_control_baseline",
      context: "control",
      path: "000_control/up.sql",
      checksum:
        "2a5d7f30684c99e3ff441ca8a2c38038dedd1bab4db4a40e92cd36bb22be297f",
      description:
        "Baseline control migration — creates the migration tracking schema",
    },
    {
      id: "010_unicorns",
      context: "app",
      path: "010_unicorns/up.sql",
      checksum:
        "446451704a7c25e7198bff264d94ffe25cdf3e298584e5ae4bcb209a285309ec",
      description:
        "The unicorns table, verbatim from upstream lib/seed.ts's CREATE TABLE",
    },
    {
      id: "020_sample_unicorns",
      context: "app",
      path: "020_sample_unicorns/up.sql",
      checksum:
        "bc7c7d719004a06163d78d213d3a658a2e2d5fe1da96bb5423202668a6d18732",
      description:
        "Sixty fictional companies in the unicorns table's shape, so a fresh deployment has rows to query; ON CONFLICT (company) DO NOTHING. Upstream's CB Insights CSV is the owner's to load (tooling/migrations/csv-to-sql.mjs)",
    },
    {
      id: "030_row_level_security",
      context: "app",
      path: "030_row_level_security/up.sql",
      checksum:
        "ed913738eb1d34c4e35e8d882673ae0d7be1222ccb4c7f38857406418b9224ab",
      description:
        "Row-level security on every table in public (unicorns) — closed to Supabase's Data API (anon, authenticated), open to the app, which owns it; refuses to run if the app's role would be locked out",
    },
    {
      id: "040_read_only_queries",
      context: "app",
      path: "040_read_only_queries/up.sql",
      checksum:
        "ff70816e2812049269db1457e924aaa93d98fbf6e507286eda0225cca8a78ade",
      description:
        "query_reader (NOLOGIN, SELECT on unicorns through one policy, nothing else) and app_private.run_read_only(query), a SECURITY DEFINER function it owns: the only way the app runs the model's SQL, as that role, unable to SET ROLE back",
    },
  ],
};
