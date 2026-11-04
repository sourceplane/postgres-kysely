#!/usr/bin/env node
// `pnpm db:migrate` — the schema, into a LOCAL database (POSTGRES_URL; default
// the Supabase CLI's localhost:54322). Stage and prod are migrated by
// db-migrate (packages/db's runner, before the Worker deploys); this applies
// the very same files, so there is one copy of the schema.
//
// Kysely's own Migrator does it: each of packages/db's app migrations, in the
// manifest's order, is a Kysely migration whose `up` runs that file, and
// Kysely records what it applied in its own schema (`kysely`, never `public`,
// which Supabase's Data API serves). The control
// migration (000) is skipped: it creates the ledger packages/db's runner keeps,
// and a local database is Kysely's to track.
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Kysely, Migrator, sql } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import { appMigrations } from './app-migrations.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const DB = join(here, '../../../packages/db/src')

export function provider() {
  return {
    async getMigrations() {
      const out = {}
      for (const { id, path } of appMigrations()) {
        const text = readFileSync(join(DB, 'migrations', path), 'utf8')
        out[id] = { up: (db) => sql.raw(text).execute(db) }
      }
      return out
    },
  }
}

async function main() {
  const url = process.env.POSTGRES_URL || 'postgres://postgres:postgres@localhost:54322/postgres'
  const local = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)
  const db = new Kysely({
    dialect: new PostgresJSDialect({ postgres: postgres(url, { onnotice: () => {}, ...(local ? {} : { ssl: 'require' }) }) }),
  })
  const { error, results } = await new Migrator({ db, provider: provider(), migrationTableSchema: 'kysely' }).migrateToLatest()
  for (const r of results ?? []) console.log(`${r.status === 'Success' ? 'applied' : r.status}: ${r.migrationName}`)
  if (!results?.length && !error) console.log('up to date')
  await db.destroy()
  if (error) {
    console.error('db:migrate failed:', error)
    process.exit(1)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  await main()
}
