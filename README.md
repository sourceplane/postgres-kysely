# postgres-kysely

Vercel's [Postgres + Kysely Next.js Starter](https://github.com/vercel/examples/tree/main/storage/postgres-kysely)
— a page that reads a `profiles` table with Kysely and seeds it on first
use — running on **Cloudflare Workers + Static Assets** through
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), with the
database a **Supabase Postgres** project reached through **Cloudflare
Hyperdrive**, both provisioned by Terraform through
[Orun](https://github.com/sourceplane/orun) and the schema applied by Orun's
`db-migrate` (the way the [Lumen baseline](https://github.com/sourceplane/lumen)
does it), deployed by
[Orun](https://github.com/sourceplane/orun) to stage and prod on every merge.
Packaging it as an Orun baseline is the next milestone (KY2).

The template's code is the code. What the port changes is what the Workers
runtime and a fresh, unattended deployment force: upstream's `db` resolves
to a Kysely client per request over the Hyperdrive binding (`lib/kysely.ts`),
its call sites unchanged, and the table is created by migrations before the
app serves rather than by the page's first request — upstream's
`createTable('profiles').ifNotExists()` from the page fails for one of two
requests that race through it on a fresh database. The page
still writes its three seed rows the first time it finds the table empty,
which is safe to race. Every table in `public` has row-level security, so
Supabase's Data API serves none of it. See [`specs/epics/postgres-kysely`](specs/epics/postgres-kysely/README.md)
for the design, the milestones and the as-built status, including every
departure.

## What is here (the product)

| Surface | Where |
|---|---|
| The product's name (the page's heading and its title) | `apps/web/lib/site.ts` |
| The page and the table | `apps/web/app/page.tsx`, `apps/web/components/table.tsx` |
| The per-request Kysely client (Hyperdrive first, `POSTGRES_URL` fallback) and its types, the seed | `apps/web/lib/kysely.ts`, `apps/web/lib/seed.ts` |
| The database check the deploy smoke-tests | `apps/web/app/api/health/route.ts` |
| Workers build, bindings and deploy contract | `apps/web/next.config.mjs`, `open-next.config.ts`, `wrangler.template.jsonc` → `wrangler.jsonc` (committed), `component.yaml` |
| The schema as migrations, and Lumen's runner | `packages/db` (`@saas/db` — the name the db-migrate composition builds); `apps/web/scripts/migrate.mjs` applies the same files to a local database through Kysely's `Migrator` |
| The Supabase project, the Hyperdrive config, the migration step | `infra/terraform/supabase`, `infra/terraform/cloudflare-hyperdrive`, `infra/db-migrate` |
| Tests | `tests/web`, `tests/db` (vitest; `tests/db` runs the migrations in PGlite) |

## Getting started

```bash
pnpm install
pnpm run wire:fixture   # re-render apps/web/wrangler.jsonc from its template (committed; this changes nothing)
pnpm typecheck
pnpm lint
pnpm test
pnpm build              # next build + opennextjs-cloudflare build → apps/web/.open-next
```

The build needs no database. Running it locally — a Postgres on
`localhost:54322` (`supabase start`), `pnpm --filter @app/web db:migrate`,
then `next dev` or `wrangler dev` — is in the product's README
(`.baseline/product/README.md`), which is what a product built from here
carries.

## How it maps to Vercel

| Vercel | Here |
|---|---|
| Next.js hosting | One Cloudflare Worker (`.open-next/worker.js`) + Static Assets |
| Vercel Postgres (`POSTGRES_URL`), a module-level Kysely `db` | The Supabase project's Postgres through Hyperdrive: `db` is still upstream's export, resolved to a Kysely client per request from `env.HYPERDRIVE.connectionString` (postgres.js under `kysely-postgres-js`, its type fetch left on); `POSTGRES_URL` is for local work without wrangler |
| The page creates the table on its first request (Kysely's schema builder) | `infra/db-migrate` applies `packages/db/src/migrations` (the table, then row-level security) per environment, after the project and the Hyperdrive config exist, before the Worker deploys; the page writes only the seed rows |
| `preferredRegion = 'home'` | Dropped: a Worker runs near its visitor; Hyperdrive pools near the database |
| A database created in the dashboard | `infra/terraform/supabase` (one project per environment) + `infra/terraform/cloudflare-hyperdrive` (one config per environment), ids and credentials as orun secrets |
| "Deploy with Vercel" (clone the template) | `orun new --blueprint repo-blueprint.yaml` — a new repository, branded, provisioned, migrated, deployed |

## CI

| Workflow | What it runs | Ships to a product |
|---|---|---|
| `ci.yml` | the Orun pipeline, and the only workflow a product carries: `orun plan --changed`, then one job per lane. A pull request runs the verify lanes (the app built and dry-deployed per environment, both Terraform roots checked and planned, the migrations planned), except the bootstrap's own landings (`orun/BASE-*`), where `plan` alone runs and nothing waits for it — the landing was checked in the build box; a merge applies, migrates and deploys stage → prod. The lanes do not typecheck, lint or run the tests: `baseline.yml`'s e2e tier does, on the landing, before each tag. It plans nothing while `intent.yaml` names the placeholder workspace `ws_CHANGE_ME`, as this repository does. A manual run (Orunbase's Deploy button, or Run workflow on `main`) plans the environment and components it names under the push-to-main trigger, so they deploy as a merge deploys them | yes |
