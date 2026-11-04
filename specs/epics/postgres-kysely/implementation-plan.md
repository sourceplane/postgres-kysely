# postgres-kysely — implementation plan

Three milestones, one pull request each, squash-merged when green.

## KY0 — the spec (KY-1)

The repository is born (intent with the placeholder workspace, Orun CI byte
for byte turso-starter's, the shared TypeScript and ESLint configuration, the
wrangler renderer, the migrations manifest tool, the spec index), then this
doc set and the three task contracts land.

**Done when** the epic and the contracts are on `main`.

## KY1 — the profiles table on Workers and Supabase (KY-2)

1. The template in `apps/web` on Next.js 16.3.8 with `@opennextjs/cloudflare`:
   `output: standalone`, the monorepo tracing root, `images.remotePatterns`,
   `initOpenNextCloudflareForDev()`.
2. `lib/kysely.ts`: upstream's types, and `db` resolved per request (a Proxy,
   a WeakMap keyed by the request's ExecutionContext, Hyperdrive's
   connection string, `POSTGRES_URL` without a context), postgres.js's type
   fetch left on.
3. The table and row-level security as `packages/db` migrations (010, 020) with
   their manifest; `infra/db-migrate` applies them; `lib/seed.ts` keeps only
   the INSERTs; `components/table.tsx` seeds an empty table and reads the seed
   back with a query Hyperdrive will not cache, and says when the migrations
   have not run.
4. `pnpm db:migrate`: Kysely's `Migrator` over the same files.
5. `/api/health`: 200 only with the table migrated and RLS on.
6. `infra/terraform/supabase` and `infra/terraform/cloudflare-hyperdrive`, the
   wiring template and its committed fixture render, `apps/web/component.yaml`.
7. `tests/web` and `tests/db` (PGlite).

**Done when** typecheck, lint, test and build are green and `wrangler dev`
over the build seeds and lists the profiles from a migrated database and
reports the migrations pending on a blank one.

## KY2 — a baseline (KY-3)

postgres-drizzle-starter's machinery on this tree: `blueprint.yaml` (the
console card: Cloudflare and Supabase, five brokered keys, the subdomain read
from the connection, no domain asked), `repo-blueprint.yaml` (one landing,
`01-product`, then the record, `02-docs`), `.baseline/` (identity, the
product's README, task contracts), the rename engine (with the upstream
template's directory and demo — which spell this slug — protected), the
bootstrap helpers, the deployment-record renderer, the phase pages, the
context pack, and the baseline's tests.

**Done when** Baseline CI is green on the pull request and on `main`, then
`baseline-v1` is tagged.
