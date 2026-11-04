import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { manifest } from "@saas/db/manifest";

// The profiles table as the migrations leave it, on a real Postgres in
// process (PGlite): the columns upstream's Kysely schema builder declared
// (lib/kysely.ts types them), and the unique email the page's seed relies on
// to be safe when two first requests race.
const migrationsDir = path.resolve(__dirname, "../../../packages/db/src/migrations");
const seedFile = path.resolve(__dirname, "../../../apps/web/lib/seed.ts");

async function migrated(): Promise<PGlite> {
  const db = new PGlite();
  for (const entry of manifest.migrations) {
    await db.exec(readFileSync(path.join(migrationsDir, entry.path), "utf8"));
  }
  return db;
}

// The three INSERTs lib/seed.ts sends, read out of the file itself.
function seedStatements(): string[] {
  const src = readFileSync(seedFile, "utf8");
  return [...src.matchAll(/sql`([\s\S]*?)`\.execute\(db\)/g)].map((m) => m[1]!.trim());
}

describe("the profiles table (after every migration)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await migrated();
  }, 60_000);

  it("has upstream's columns", async () => {
    const { rows } = await db.query<{ column_name: string; data_type: string; is_nullable: string; len: number | null }>(
      `select column_name, data_type, is_nullable, character_maximum_length as len
         from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
        order by ordinal_position`,
    );
    expect(rows).toEqual([
      { column_name: "id", data_type: "integer", is_nullable: "NO", len: null },
      { column_name: "name", data_type: "character varying", is_nullable: "NO", len: 255 },
      { column_name: "email", data_type: "character varying", is_nullable: "NO", len: 255 },
      { column_name: "image", data_type: "character varying", is_nullable: "YES", len: 255 },
      { column_name: "createdAt", data_type: "timestamp with time zone", is_nullable: "YES", len: null },
    ]);
  });

  it("keeps exactly the three profiles however often the seed runs", async () => {
    const statements = seedStatements();
    expect(statements).toHaveLength(3);
    for (let pass = 0; pass < 3; pass++) {
      await Promise.all(statements.map((s) => db.exec(s)));
    }
    const { rows } = await db.query<{ email: string }>("select email from profiles order by id");
    expect(rows.map((r) => r.email)).toEqual(["rauchg@vercel.com", "lee@vercel.com", "stey@vercel.com"]);
  });

  it("applies the table migration again without harm", async () => {
    await db.exec(readFileSync(path.join(migrationsDir, "010_profiles/up.sql"), "utf8"));
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from profiles");
    expect(rows[0]!.n).toBe(3);
  });
});
