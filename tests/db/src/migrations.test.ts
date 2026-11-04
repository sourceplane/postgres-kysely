import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { manifest } from "@saas/db/manifest";
import { buildPlan, runMigrations } from "@saas/db/runner";

const migrationsDir = path.resolve(__dirname, "../../../packages/db/src/migrations");
// db-migrate applies these files to stage and prod; `pnpm --filter @app/web
// db:migrate` applies the very same files to a local database, through
// Kysely's Migrator (apps/web/scripts/migrate.mjs). There is one copy of the
// schema; what can drift is the LIST the local migrator reads.
import { appMigrations } from "../../../apps/web/scripts/app-migrations.mjs";

describe("the migration manifest (packages/db)", () => {
  it("starts with the control migration and names every file with its checksum", () => {
    expect(manifest.migrations[0]?.id).toBe("000_control_baseline");
    for (const entry of manifest.migrations) {
      const file = readFileSync(path.join(migrationsDir, entry.path));
      expect(createHash("sha256").update(file).digest("hex"), entry.id).toBe(entry.checksum);
    }
  });

  it("plans every migration as pending offline", async () => {
    const result = await runMigrations(manifest, { mode: "plan", migrationsDir, adapter: null });
    expect(result.failed).toBeNull();
    expect(result.applied).toEqual(manifest.migrations.map((m) => m.id));
  });

  it("gives the local migrator exactly the app migrations, in the manifest's order", () => {
    const app = manifest.migrations.filter((m) => m.context === "app");
    expect(appMigrations()).toEqual(app.map((m) => ({ id: m.id, path: m.path })));
    // the control migration is the runner's own ledger, never a local one
    expect(appMigrations().map((m) => m.id)).not.toContain("000_control_baseline");
  });

  it("creates the table idempotently — a database the old page seeded keeps its table", () => {
    const sql = readFileSync(path.join(migrationsDir, "010_profiles/up.sql"), "utf8");
    expect(sql).toMatch(/create table if not exists "profiles"/);
    // the seed's ON CONFLICT (email) needs the unique email upstream's Kysely schema declared
    expect(sql).toMatch(/"email" varchar\(255\) not null unique/);
  });

  it("skips what the database already recorded", () => {
    const applied = new Map([[manifest.migrations[0]!.id, manifest.migrations[0]!.checksum]]);
    const plan = buildPlan(manifest, applied, migrationsDir);
    expect(plan.alreadyApplied).toEqual([manifest.migrations[0]!.id]);
    expect(plan.pending.map((m) => m.id)).toEqual(manifest.migrations.slice(1).map((m) => m.id));
    expect(plan.checksumMismatches).toEqual([]);
  });
});
