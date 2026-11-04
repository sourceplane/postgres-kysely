# postgres-kysely — implementation status

| Milestone | State | Landed |
|---|---|---|
| KY0 — the spec | ✅ | KY-1 |
| KY1 — the profiles table on Workers and Supabase | ✅ | KY-2 |
| KY2 — a baseline | planned | KY-3 |

## Departures from the upstream template

Everything not listed here is the template as it is upstream at `de86723`
(vercel/examples `storage/postgres-kysely`).

| # | What | Why |
|---|---|---|
| 1 | The app lives in `apps/web` of a pnpm workspace (`@app/web`); upstream's `package.json`, `.gitignore`, `.eslintrc.json` and README are replaced by the workspace's; `build` adds the OpenNext build, and `preview`, `typecheck`, `wire:fixture` and `db:migrate` are added | The workspace's shape (postgres-drizzle-starter's) |
| 2 | Next ^16.0.10 → 16.3.8 with `@opennextjs/cloudflare` 1.20; eslint 8 / eslint-config-next 13.5.4 → eslint 9 / eslint-config-next 16.3.8 (flat config); `@types/node` 20 → 22; tailwind 3.3 → 3.4; `@types/*` and the build tools moved to devDependencies | OpenNext's supported Next; the workspace's lint config |
| 3 | `kysely ^0.26.3`, `kysely-postgres-js ^2.0.0` and `postgres ^3.4.5` kept (resolved 0.26.3, 2.0.0, 3.4.9) | The template's lines (risk KY-L) |
| 4 | `lib/kysely.ts`: upstream's `Database` types and `sql` re-export kept; `db` is a Proxy over a Kysely client per request — `postgres(env.HYPERDRIVE.connectionString, { max: 5, prepare: false })`, kept in a WeakMap against the request's ExecutionContext — or, without a Cloudflare context, one `postgres(POSTGRES_URL, { ssl: 'require' })` client | The Workers runtime forbids cross-request sockets (risk KY-A); call sites unchanged |
| 5 | postgres.js's `fetch_types` left at its default (postgres-drizzle-starter sets `false`) | `sql.reserve()` never resolves with it off (risk KY-K) |
| 6 | `lib/seed.ts`: the `db.schema.createTable('profiles').ifNotExists()…` block removed; the three INSERTs kept as written | The table is `db-migrate`'s (risk KY-B) |
| 7 | `packages/db/src/migrations/010_profiles` is upstream's Kysely DDL compiled (`create table if not exists "profiles"` with `varchar(255)` name and unique email, nullable image, `timestamp with time zone` createdAt defaulting to `current_timestamp`); `020_row_level_security` enables RLS with no policy, behind a guard | Applied before the Worker serves; the Data API's roles see nothing (risk KY-E) |
| 8 | `components/table.tsx`: on `relation "profiles" does not exist` it renders "The profiles table does not exist yet" (`data-schema="missing"`, the command to run) instead of creating the table; an empty table is seeded and read back with `.where(sql<boolean>\`now() is not null\`)` | Never DDL from the page; Hyperdrive's read cache (risk KY-I) |
| 9 | `scripts/migrate.mjs` + `scripts/app-migrations.mjs` (new): `pnpm db:migrate` runs Kysely's `Migrator` over packages/db's app migrations, its ledger in schema `kysely` | Local databases get the same files, through Kysely |
| 10 | `app/api/health/route.ts` (new): 200 only when the table exists with RLS on, through `` sql`…`.execute(db) `` | The deploy's smoke and the bootstrap's probes read it |
| 11 | `app/page.tsx`: the heading reads `SITE_NAME` (`lib/site.ts`, "Postgres on Cloudflare"; upstream "Postgres on Vercel"); "Deploy your own to Vercel" (the template page) → "Deploy your own to Cloudflare" (this repository); `preferredRegion = 'home'` removed | One rename seam; no Vercel region hint on Workers |
| 12 | `app/layout.tsx`: `metadataBase` from `NEXT_PUBLIC_SITE_URL` (upstream `https://postgres-kysely.vercel.app`); `title` from `SITE_NAME` | The origin per environment, set by the build |
| 13 | `next.config.mjs`: `images.domains` → `images.remotePatterns`, `output: standalone`, the monorepo tracing root, `initOpenNextCloudflareForDev()` | Next 16 and OpenNext |
| 14 | `wrangler.template.jsonc` → committed `wrangler.jsonc`, `wiring.fixture.json`, `cloudflare-env.d.ts`, `open-next.config.ts`, `component.yaml` | The Worker's config and deploy contract replace Vercel's |
| 15 | Tests: `tests/web` (the per-request client, `timeAgo`, the table's branches, the seed, `/api/health`, the wrangler render) and `tests/db` (the manifest and the local migrator's list, the table's columns and a racing seed, row-level security, on PGlite) | The template ships none |
