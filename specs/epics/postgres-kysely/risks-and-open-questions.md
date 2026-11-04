# postgres-kysely — risks and open questions

## KY-A — `db` resolved per request behind a Proxy (ACCEPTED)

The Workers runtime refuses to reuse a socket across requests ("Cannot
perform I/O on behalf of a different request"), so upstream's module-level
client cannot stand. `db` stays upstream's export: a Proxy whose every
property read resolves to a Kysely client kept in a `WeakMap` against
`getCloudflareContext().ctx`, so all of one request's queries share a client
and nothing outlives the request. Hyperdrive pools on Cloudflare's side, so a
client per request costs a connection to the nearest Hyperdrive, not to
Supabase. Methods are bound to the real client (Kysely's private fields need
it), which `tests/web` asserts.

## KY-B — The lazy CREATE TABLE (RESOLVED: the table is db-migrate's)

Upstream created the table from the page on `relation "profiles" does not
exist`. `IF NOT EXISTS` is checked before the catalog insert, not under a
lock, so two first requests can both create it and the loser fails on
Postgres's own unique index (`pg_type_typname_nsp_index`) — a 500 for that
visitor (measured for the drizzle twin: 2 of 160 racing sessions) — and the
app's role would need DDL rights at request time. `010_profiles` applies
upstream's own Kysely DDL before the Worker deploys; the page keeps only the
INSERTs, which are safe to race (`ON CONFLICT (email) DO NOTHING` against the
unique email). `tests/db` runs the seed's three statements three times
concurrently and finds three rows; the e2e races eight first requests.

## KY-C — The verify lane and `wrangler dev` without a database (RESOLVED)

The build does not touch the database (the page is `force-dynamic`).
`wrangler dev` points the binding at the Supabase CLI's local Postgres
(`localConnectionString`); without one running, the page errors on the
connection, which is what upstream does without `POSTGRES_URL`.

## KY-E — Supabase's Data API and a table with no RLS (RESOLVED)

A Supabase project serves `public` through PostgREST to anyone with the
project's anon key. `020_row_level_security` enables RLS with no policy:
`anon` and `authenticated` get nothing, and the app — which connects as
`postgres`, the table's owner — is not subject to it. Its guard refuses to
run if `postgres` would be locked out. `tests/db` fails on any table in
`public` without RLS. The local migrator keeps its ledger in schema `kysely`,
never `public`.

## KY-F — Two Supabase projects per product (OWNER PREREQUISITE)

Stage and prod are separate projects, and Supabase's free plan allows two
active projects per organization. The card's description and BOOTSTRAP.md
say so; an org without room fails the supabase apply, nothing downstream
runs, and a re-run after freeing room adopts what exists.

## KY-H — The migrations package is named `@saas/db` (ACCEPTED)

stack-tectonic's `db-migrate` composition (0.19.0) builds `--filter=@saas/db`
and runs `dist/runner/cli.js` two levels above the component's `path`.

## KY-I — Hyperdrive's read cache and the first-request seed (RESOLVED)

The Hyperdrive config caches read queries (60 s `max_age`) and does not
invalidate them on a write: after a seed on an empty table, the plain select
would answer "Fetched 0 users" for up to a minute. The read-back after a
seed therefore carries `where now() is not null` (a STABLE function, which
Hyperdrive never caches). Ordinary page views stay cacheable. `/api/health`'s
query calls `to_regclass` (STABLE) and is never cached. Not observable
offline: `wrangler dev`'s local binding has no cache.

## KY-K — postgres.js `reserve()` hangs with `fetch_types: false` (RESOLVED: type fetch on)

kysely-postgres-js runs every query on a reserved connection
(`sql.reserve()`). In postgres.js 3.4.9 (the latest), a connection opened for
a waiting reserve is handed to it only from the type-fetch step: with
`fetch_types: false`, `ReadyForQuery` drops the pending reserve and nothing
resolves it — the request hangs. Proven under `wrangler dev` against local
Hyperdrive: a plain query answered in 4–27 ms while a reserve never returned;
with the default type fetch the reserve answered in 5 ms and Kysely in 6 ms
(spike notes). The same code is in postgres.js's Node build, so it is not a
workerd quirk. `lib/kysely.ts` therefore leaves `fetch_types` at its default
(one catalog read per new connection, cacheable by Hyperdrive), unlike
postgres-drizzle-starter (Drizzle never reserves). `tests/web` fails if
`fetch_types` is set. Revisit if postgres.js fixes `ReadyForQuery`.

## KY-L — Kysely 0.26 (ACCEPTED)

The template's range `^0.26.3` resolves to 0.26.3; Kysely is at 0.28. The
port keeps the template's line: 0.26 has everything it uses (`Migrator` with
`migrationTableSchema` included). A bump is a separate change.

## KY-J — No live bootstrap yet (OPEN)

Everything short of the platform is proven on every pull request: the card
against the build, the blueprint read by the bootstrap floor, the leak gate,
the offline bootstrap with the blueprint's own hooks, the product's own plan
(supabase → cloudflare-hyperdrive → db-migrate → web per environment,
enforced on main, advisory on a pull request), and the produced product
migrated by its own runner into a real Postgres, built, dry-deployed, served
over that database with racing first requests, smoke-tested, and read by the
Data API's roles, which see nothing. NOT proven: the repository created and
linked, the keys minted by `integrations/reconcile`, a real `terraform apply`,
a `db-migrate` apply against a real Supabase project, a real `wrangler
deploy`, Hyperdrive's read cache (KY-I), and the probes of `/` and
`/api/health`. Closes with one bootstrap from a tag against a workspace with
Cloudflare and Supabase connections and room for two Supabase projects
(KY-F).
