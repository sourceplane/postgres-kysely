# postgres-kysely

Vercel's [Postgres + Kysely Next.js Starter](https://github.com/vercel/examples/tree/main/storage/postgres-kysely)
— a page that reads a `profiles` table with Kysely and seeds it on first
use — running on **Cloudflare Workers + Static Assets** through
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), with the
database a **Supabase Postgres** project reached through **Cloudflare
Hyperdrive**, both provisioned by Terraform through
[Orun](https://github.com/sourceplane/orun) and the schema applied by Orun's
`db-migrate` (the way the [Lumen baseline](https://github.com/sourceplane/lumen)
does it), and packaged as an **Orun baseline**: one command takes a new
product from nothing to live on stage and prod, in its own repository, under
its own name — in ONE landing.

The template's code is the code. What the port changes is what the Workers
runtime and a fresh, unattended deployment force: upstream's `db` resolves
to a Kysely client per request over the Hyperdrive binding (`lib/kysely.ts`),
its call sites unchanged, and the table is created by migrations before the
app serves rather than by the page's first request — upstream's
`createTable('profiles').ifNotExists()` from the page fails for one of two
requests that race through it on a fresh database. The page
still writes its three seed rows the first time it finds the table empty,
which is safe to race. Every table in `public` has row-level security, so
Supabase's Data API serves none of it. What the baseline adds is everything
needed to make a copy of it somebody else's, built the way
[cirrus-baseline](https://github.com/sourceplane/cirrus-baseline) is. See [`specs/epics/postgres-kysely`](specs/epics/postgres-kysely/README.md)
for the design, the milestones and the as-built status, including every
departure.

## Instantiating a product

```bash
git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/postgres-kysely
cd postgres-kysely
orun new --blueprint repo-blueprint.yaml --out ~/products/acme-postgres --run-hooks --resume \
  --set reponame=acme-postgres --set productname="Acme Cloud" \
  --set githuborg=acme-inc --set subdomain=<workers-dev-subdomain>
```

Or, once the platform's registry lists it, from the Orun console (Baselines →
`postgres-kysely` → Build). Two phases: **`01-product`** creates the
repository, mints the five brokered credentials (Cloudflare and Supabase) and
lands the whole product as one pull request, whose convergence on `main`
provisions and deploys it per environment in a fixed order —

```
supabase ──▶ cloudflare-hyperdrive ──▶ db-migrate ──▶ web
```

— each edge `mode: enforced` on a push to main and advisory on a pull
request; then **`02-docs`** records the live deployment from probed facts.
**[BOOTSTRAP.md](BOOTSTRAP.md)** is the operator guide;
[docs/phases/](docs/phases/README.md) has a page per phase. The Supabase
organization needs room for two projects (stage and prod) — the free plan's
limit.

The new repository receives the **product only** — the app, the Terraform
roots, the migrations, the tests, its CI, its tooling, a README of its own
and its operating contract — renamed throughout to the product's name,
repository, Worker, Supabase project and Hyperdrive config. None of this
repository's machinery ships. The card asks for no third-party key: the app
uses none.

| What makes it a baseline | Where |
|---|---|
| The console card (inputs, secrets, programme) | `blueprint.yaml` |
| The build document (modules, phases, hooks) | `repo-blueprint.yaml` |
| This tree's identity, the product's README and the bootstrap's task contracts | `.baseline/` |
| The rename engine (product-name seam: `apps/web/lib/site.ts`) | `tooling/rebrand/rebrand.mjs` |
| The bootstrap's helpers (deferrals, redeploy marker, work-tree strip) | `tooling/bootstrap/` |
| The deployment-record renderer | `hooks/render-deployment-docs.sh` |
| The product's context pack | `ai/context/` |
| The baseline's tests: contract, leak, offline bootstrap and plans, end to end | `testing/`, `.github/workflows/baseline.yml` |
| Cutting a `baseline-vN` tag | `.github/workflows/tag.yml` |

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
| `baseline.yml` | the baseline's own tiers: contract tests; the blueprint read by the pinned orun, the leak gate, the offline bootstrap and the product's own plans; the product built, migrated into a local Postgres, dry-deployed and served, its first-request seed raced and its table shut to the Data API's roles | no |
| `tag.yml` | cuts a `baseline-vN` tag (manual) | no |
