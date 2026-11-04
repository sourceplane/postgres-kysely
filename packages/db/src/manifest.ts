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
      id: "010_profiles",
      context: "app",
      path: "010_profiles/up.sql",
      checksum:
        "6b2de3879a7bc5c1d9870095ba40999c2ce3e90fbd71719b4c86961d3b7b1bfb",
      description:
        "The template's profiles table, as upstream's Kysely schema builder created it (IF NOT EXISTS) — applied before the Worker serves instead of created by its first request; `pnpm --filter @app/web db:migrate` applies the same file locally through Kysely's Migrator",
    },
    {
      id: "020_row_level_security",
      context: "app",
      path: "020_row_level_security/up.sql",
      checksum:
        "1a7ee9e904af66f2cc97b6bb412ba1815f317e432a4a554e82c8d6676b329d64",
      description:
        "Row-level security, with no policies, on every table in public — closed to Supabase's Data API (anon, authenticated), open to the app, which owns them; refuses to run if the app's role would be locked out",
    },
  ],
};
