# Epics

Orun-style work programs. Each epic is a folder carrying `epic.yaml` (the
declaration the platform reads: slug, key prefix, milestones with exit
criteria and task keys) beside its doc set. The pull request that adds the
folder is the adoption; the merge creates the epic in the workspace.

| Epic | Cluster | Status | What it is |
|------|---------|--------|------------|
| [`postgres-kysely/`](./postgres-kysely/) | **KY** | In progress (KY1: the site on Workers) | Vercel's Postgres + Kysely Next.js Starter, its `db` resolved per request over Hyperdrive to Supabase Postgres and its table applied by db-migrate — and an Orun baseline that instantiates it in one landing (KY2) |

As-built ≠ intent: what shipped lives in each epic's `IMPLEMENTATION-STATUS.md`.
