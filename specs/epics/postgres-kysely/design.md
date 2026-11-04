# postgres-kysely — design

## 1. What the template is

`lib/kysely.ts` declares the `Database` interface (one `profiles` table:
`Generated<number>` id, name, email, image, a `ColumnType<Date, string |
undefined, never>` createdAt) and a module-level `db = new Kysely<Database>`
over `PostgresJSDialect({ postgres: postgres(POSTGRES_URL, { ssl: 'require' }) })`,
re-exporting Kysely's `sql`. `components/table.tsx` runs
`db.selectFrom('profiles').selectAll().execute()`; on `relation "profiles"
does not exist` it calls `lib/seed.ts` — `db.schema.createTable('profiles')
.ifNotExists()` plus three `` sql`INSERT … ON CONFLICT (email) DO NOTHING`.execute(db) `` —
and selects again. The page is `force-dynamic` (and asks Vercel for
`preferredRegion = 'home'`) and shows the rows with `timeAgo`; a client
button calls `router.refresh()`.

## 2. The mapping (Vercel → Cloudflare + Supabase)

| Vercel primitive the template uses | Here |
|---|---|
| Next.js hosting (dynamic page) | Cloudflare Workers + Static Assets; the Worker is `@opennextjs/cloudflare`'s output, Next.js 16.3.8 |
| Vercel Postgres (`POSTGRES_URL` with `ssl: 'require'`) | Supabase Postgres through Cloudflare Hyperdrive: `postgres(env.HYPERDRIVE.connectionString, { max: 5, prepare: false })` under Kysely's `PostgresJSDialect`, or `postgres(POSTGRES_URL, { ssl: 'require' })` without a Cloudflare context |
| A module-level `db` | The same `db`, a Proxy: every property read resolves to the current request's Kysely client, kept in a `WeakMap` against `getCloudflareContext().ctx` (the request's ExecutionContext). Call sites are upstream's (risk KY-A) |
| The page creates the table on its first request | `infra/db-migrate` applies `packages/db/src/migrations` — `010_profiles` (upstream's Kysely DDL, compiled), `020_row_level_security` — per environment, after the project and the Hyperdrive config exist and before the Worker deploys; the page seeds only the rows, on an empty table (risk KY-B) |
| (no local migrations: the page made the table) | `pnpm --filter @app/web db:migrate`: Kysely's `Migrator` over the same files, its ledger in schema `kysely` |
| `preferredRegion = 'home'` | Dropped: Vercel's function-region hint. A Worker runs near its visitor and Hyperdrive pools near the database |
| `images.domains` | `images.remotePatterns` for `images.ctfassets.net` (the `domains` key is gone in Next 16) |
| Hard-coded `metadataBase` | `NEXT_PUBLIC_SITE_URL`, set by the Orun build to the environment's Worker URL (or `SITE_URL`) |
| A database created in the dashboard | `infra/terraform/supabase` (one project per environment) + `infra/terraform/cloudflare-hyperdrive` (the config fronting it; wiring `{hyperdrive_id, hyperdrive_name}`) |
| Deploy on push | Orun: `apps/web/component.yaml` renders the config for `$ORUN_ENVIRONMENT`, builds and deploys `postgres-kysely-web-{stage,prod}` on merge to `main` once linked, after `cloudflare-hyperdrive` and `db-migrate` (enforced on main) |

Alternatives rejected:
- **`getDb()` per call** (postgres-drizzle-starter's shape). It changes every
  call site; a Proxy over a per-request client keeps upstream's `db` and
  `` sql`…`.execute(db) `` exactly as written.
- **Kysely's `PostgresDialect` over `pg`.** The template's point is
  `kysely-postgres-js` over postgres.js; the one trap that combination has on
  Workers (KY-K) is a connection option, not a reason to change drivers.
- **Keeping the lazy CREATE TABLE.** It races (KY-B) and needs DDL rights per
  request; a schema applied before the app serves is what an unattended first
  deploy needs.
- **A drizzle-kit-style twin of the SQL for local databases.** Kysely's own
  `Migrator` applies the very files db-migrate applies, so there is one copy.

## 3. The connection flow

```
request ──► Worker ──► db (Proxy) ──► per-request Kysely ──► postgres.js reserve ──► Hyperdrive (pooled) ──► Supabase Postgres
                  ▲ no Cloudflare context (next dev / scripts): one POSTGRES_URL client, ssl required
before the first deploy: db-migrate → profiles (+ row-level security)
first render: select → no rows → seed() (INSERT … ON CONFLICT DO NOTHING) → select … where now() is not null
             select → "relation does not exist" → "apply the migrations" (never created here)
```

kysely-postgres-js runs every query on a reserved connection
(`sql.reserve()`); postgres.js 3.4 resolves a reserve on a fresh connection
only after its type fetch, so `fetch_types` keeps its default (KY-K).

## 4. The wiring flow

`wrangler.template.jsonc` carries `@@wiring(cloudflare-hyperdrive/__ENV__:hyperdrive_id)@@`
and a `localConnectionString` for wrangler dev (the Supabase CLI's default
Postgres); `pnpm run wire:fixture` renders it from `wiring.fixture.json` into
the COMMITTED `wrangler.jsonc` (the composition checks it exists before the
build, in a fresh checkout), which the dev verify lane uses; the stage and
prod lanes re-render it from `WIRING_CLOUDFLARE_HYPERDRIVE_<ENV>` before they
build. On a push to main the four components converge in one run, per
environment, in the order `supabase → cloudflare-hyperdrive → db-migrate →
web`, each edge `mode: enforced` (advisory on a pull request).

## 5. The repository

```
apps/web                               the template + the Workers build
  lib/kysely.ts                        upstream's Database types; `db` resolved per request (Hyperdrive first)
  lib/seed.ts                          the three seed rows (no DDL)
  scripts/migrate.mjs, app-migrations.mjs   `pnpm db:migrate`: Kysely's Migrator over packages/db's files
  app/api/health/route.ts              the database check the smoke and probes read
  wrangler.template.jsonc              worker name, nodejs_compat, ASSETS, the HYPERDRIVE binding
packages/db                            the migrations and Lumen's runner (@saas/db)
infra/terraform/supabase               the Supabase project per environment
infra/terraform/cloudflare-hyperdrive  the Hyperdrive config per environment
infra/db-migrate                       applies packages/db's migrations per environment
tests/web                              vitest: the per-request client, timeAgo, the seeding branch, /api/health, the wrangler render
tests/db                               vitest: the manifest and the local migrator's list, the table and the racing seed, row-level security (PGlite)
```

## 6. Out of scope

Auth and RLS *policies* (the app does not use Supabase's Data API or Auth, so
RLS is enabled with none), a custom domain (the owner's to attach).
