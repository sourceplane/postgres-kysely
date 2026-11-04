# Epic: postgres-kysely (KY)

**Vercel's Postgres + Kysely starter is the Kysely twin of its Postgres + Drizzle starter: one page, one `selectFrom('profiles')`, and a seed that creates the table with Kysely's schema builder on first use. On Cloudflare the socket goes through Hyperdrive to a Supabase Postgres project — postgres-drizzle-starter's data plane — and the code that changes is where the client comes from: upstream's module-level `db` is kept at every call site, resolved to a Kysely client per request from the `HYPERDRIVE` binding, because the Workers runtime refuses to share a socket across requests.**

The port keeps the page, the table component, the refresh button, the Kysely types and the seed rows. The table itself moves into a `packages/db` migration — upstream's lazy `createTable().ifNotExists()` races on a fresh database and needs DDL rights at request time — applied by `db-migrate` with row-level security before the Worker serves; a local database gets the very same files through Kysely's own `Migrator`. It adds the Workers build, tests, the Supabase and Hyperdrive Terraform roots and the deploy contract, and makes the repository an Orun baseline.

## Status

| Field | Value |
|-------|-------|
| Status | In progress — KY1 on main: the site runs on Workers |
| Cluster | **KY** (KY0–KY2) |
| Owner(s) | `apps/web` (the page, `lib/kysely.ts`, `lib/seed.ts`, `scripts/migrate.mjs`) · `packages/db` (the migrations and their runner) · `tests/web`, `tests/db` · `infra/terraform/{supabase,cloudflare-hyperdrive}`, `infra/db-migrate` |
| Builds on | `postgres-drizzle-starter` (the same template family: its Supabase and Hyperdrive roots, migrations, health check and baseline machinery), and through it `lumen` |
| Upstream | [vercel/examples `storage/postgres-kysely`](https://github.com/vercel/examples/tree/main/storage/postgres-kysely) at `de86723` |
| Changes | The client resolution (module-level `POSTGRES_URL` → a Kysely client per request over Hyperdrive, behind upstream's `db`), the table as migrations, the Workers build, tests, two Terraform roots, the deploy contract; page copy says Cloudflare |
| Decisions locked | (1) `db` stays upstream's name and API; a Proxy resolves it per request (WeakMap by the request's ExecutionContext). (2) postgres.js keeps its default type fetch (risk KY-K). (3) The table and RLS are `db-migrate`'s; the page seeds only rows, on an empty table. (4) Local migrations through Kysely's `Migrator` over the same files, its ledger in schema `kysely`. (5) Infra before app on main: supabase → cloudflare-hyperdrive → db-migrate → web, enforced; advisory on pull requests. |
| Shipped as | `baseline-v1`; proven offline (Baseline CI: migrated into a real Postgres and served through the built Worker under `wrangler dev`), deploy gated until a workspace is linked |

## Read order

1. `design.md` — what maps to what, the connection flow, what is out of scope
2. `implementation-plan.md` — the milestones and what "done" means for each
3. `risks-and-open-questions.md` — what could go wrong and what was decided
4. `IMPLEMENTATION-STATUS.md` — what actually shipped (kept distinct from intent)

## Milestones at a glance

| Milestone | What it lands | Done when |
|---|---|---|
| KY0 — the spec | this doc set and the task contracts | merged on `main` |
| KY1 — the profiles table on Workers and Supabase | `apps/web`, `packages/db`, the two Terraform roots, `infra/db-migrate`, `tests/web`, `tests/db` | green; `wrangler dev` seeds and lists the profiles over a migrated database |
| KY2 — a baseline | card, build document, rename, bootstrap tooling, the product's README and context pack, the baseline's tests | a new product goes from nothing to live on stage and prod in one landing; Baseline CI green |
