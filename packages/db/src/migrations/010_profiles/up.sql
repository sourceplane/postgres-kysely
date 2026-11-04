-- The template's one table, exactly as upstream's lib/seed.ts built it with
-- Kysely's schema builder (`db.schema.createTable('profiles').ifNotExists()`,
-- compiled): a serial id, a name and a unique email as varchar(255), an
-- optional image, and createdAt defaulting to the current timestamp.
--
-- Upstream created the table from the page: on `relation "profiles" does not
-- exist` the first request ran that CREATE TABLE IF NOT EXISTS itself. Two
-- first requests racing through that DDL can both miss the table, and one then
-- fails on Postgres's own catalog (`duplicate key value violates unique
-- constraint "pg_type_typname_nsp_index"`), and it needs DDL rights at request
-- time. So the schema is applied here instead, before the Worker deploys. The
-- page still writes the three seed rows the first time it finds the table empty
-- (apps/web/lib/seed.ts); those inserts are safe to race.
--
-- Idempotent, as every migration here must be: the Supabase Management API
-- adapter sends each one in autocommit mode, and a database the old page
-- already created the table in keeps it. `pnpm --filter @app/web db:migrate`
-- applies this same file to a local database through Kysely's Migrator.
create table if not exists "profiles" (
  "id" serial primary key,
  "name" varchar(255) not null,
  "email" varchar(255) not null unique,
  "image" varchar(255),
  "createdAt" timestamp with time zone default current_timestamp
);
