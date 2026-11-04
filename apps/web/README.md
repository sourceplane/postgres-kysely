# @app/web — the Postgres + Kysely page on Cloudflare Workers

Vercel's [Postgres + Kysely Next.js Starter](https://github.com/vercel/examples/tree/main/storage/postgres-kysely)
([demo](https://postgres-kysely.vercel.app/)): one page that selects every
row of a `profiles` table through [Kysely](https://kysely.dev/) and shows how
long the query took. Here it is built by
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) into one
Worker plus Static Assets, and its Postgres is reached through the Worker's
`HYPERDRIVE` binding.

| File | What it does |
|---|---|
| `lib/site.ts` | The product's name: the page's heading and its `<title>` |
| `lib/kysely.ts` | Upstream's `Database` types and `db`: a Kysely client per request over `kysely-postgres-js` — the `HYPERDRIVE` binding's connection string on the Worker, `POSTGRES_URL` without a Cloudflare context — and Kysely's `sql` |
| `lib/seed.ts` | The three demo profiles, inserted `ON CONFLICT (email) DO NOTHING` the first time the page finds the table empty |
| `components/table.tsx` | Selects the rows, seeds an empty table (reading it back with a query Hyperdrive's cache cannot answer), says so when the migrations have not run |
| `app/api/health/route.ts` | 200 only when the database answers through the binding and the table exists with row-level security |
| `scripts/migrate.mjs`, `scripts/app-migrations.mjs` | `pnpm db:migrate`: Kysely's `Migrator` applies `packages/db`'s migrations to a local database (POSTGRES_URL), its ledger in schema `kysely`; the deployed databases are migrated by db-migrate from the same files |
| `wrangler.template.jsonc` → `wrangler.jsonc` | The Worker's config; the render is committed (`pnpm run wire:fixture`) |

The table is created by the migrations, never by the page: upstream ran
`db.schema.createTable('profiles').ifNotExists()` from its first request,
which fails for one of two requests that race through it on a fresh
database.

postgres.js keeps its default `fetch_types`: kysely-postgres-js runs every
query on a reserved connection, and postgres.js 3.4 never hands a fresh
connection to a waiting reserve with the type fetch off.

```bash
pnpm db:migrate     # the schema, into POSTGRES_URL (default: the Supabase CLI's localhost:54322)
pnpm dev            # next dev, with the Worker's bindings through wrangler's platform proxy
pnpm build && pnpm preview   # the built Worker under wrangler dev
```
