# postgres-kysely — decisions

The choices that shape this repository, one line each, with where the full
reasoning lives. Superseded decisions stay listed, marked, so the history
reads in order.

| # | Decision | Why | Source |
|---|---|---|---|
| 1 | Upstream's `db` kept at every call site, resolved by a Proxy to a Kysely client per request (a WeakMap keyed by the request's ExecutionContext), Hyperdrive's connection string first, `POSTGRES_URL` as the fallback without a Cloudflare context | The Workers runtime refuses to share a socket across requests; Hyperdrive pools on Cloudflare's side; the template's queries stay as written | `specs/epics/postgres-kysely/design.md` §2, risk KY-A |
| 2 | Kysely over `kysely-postgres-js` and postgres.js to Supabase Postgres through Hyperdrive, not Supabase's PostgREST client nor Kysely's `pg` dialect | The template's point is Kysely over postgres.js; PostgREST would replace both | design.md §2 |
| 3 | postgres.js's `fetch_types` stays on (its default) | kysely-postgres-js reserves a connection per query, and postgres.js 3.4 never resolves a reserve on a fresh connection with the type fetch off — the request hangs | risk KY-K, `spikes` notes in the status |
| 4 | The `profiles` table is `db-migrate`'s (`packages/db`), upstream's Kysely DDL applied before the Worker deploys; the page seeds only rows, on an empty table | A lazy `CREATE TABLE IF NOT EXISTS` is not safe under concurrent first requests and needs DDL rights per request | risk KY-B |
| 5 | A local database is migrated by Kysely's own `Migrator` over the same files (`pnpm db:migrate`), its ledger in schema `kysely` | One copy of the schema; nothing of the migrator's lands in `public` | design.md §2, risk KY-E |
| 6 | Row-level security on every table in `public`, with no policy | Supabase's Data API serves `public` to the public anon key; the app connects as the table's owner | risk KY-E |
| 7 | `wrangler.jsonc` committed as the fixture render; stage and prod re-render it from their wiring document | The composition checks for it before the build | design.md §4 |
| 8 | One landing (`01-product`) then the record (`02-docs`); every edge `mode: enforced` on main, advisory on a pull request | One convergence runs supabase → cloudflare-hyperdrive → db-migrate → web per environment | design.md §4 |
| 9 | The migrations package is named `@saas/db` | stack-tectonic's db-migrate composition builds `--filter=@saas/db` | risk KY-H |
| 10 | The read-back after a seed carries `where now() is not null` | Hyperdrive's read cache would otherwise serve the empty answer for up to a minute | risk KY-I |
| 11 | `ci.yml` plans nothing while `intent.yaml` names `ws_CHANGE_ME` (the `linked` step) | A bootstrap cannot set a repository variable | `.github/workflows/ci.yml` |
| 12 | stack-tectonic 0.19.0; orun pinned only where it runs (the `orun-action` `version:` in each workflow); no kiox | postgres-drizzle-starter's proven pins | `intent.yaml`, `.github/workflows/` |
| 13 | Component docs are generated from the manifests and checked in CI | A hand-written copy of the dependency graph, bindings and migrations drifts silently | `tooling/catalog/gen-component-docs.py` |
| 14 | The console card reads `subdomain` from the Cloudflare connection and asks for no domain; an empty `productdomain` brands the placeholder `<reponame>.example.com` | The subdomain has one right answer; the app goes live on workers.dev and attaching a domain is an owner's step | `blueprint.yaml`, `repo-blueprint.yaml`, `tooling/rebrand/rebrand.mjs` |
| 15 | The upstream template's directory (`storage/postgres-kysely`) and demo (`postgres-kysely.vercel.app`) are protected from the rename | They spell this baseline's slug, and a product's "Source" link must still point at the template | `tooling/rebrand/rebrand.mjs` (`UPSTREAM`), `testing/rebrand.test.sh` |
| 16 | The turso-starter v8 shape on orun v2.88.0: no `checks.yml`; the brokered keys in one `secrets` reconcile per provider; the task set-up in the background, each landing checked in the box (`checks: local`), the watch at 5 s | The fast bootstrap shape every starter shares | `repo-blueprint.yaml`, `testing/phases.test.sh`, `testing/coverage.test.sh` |
