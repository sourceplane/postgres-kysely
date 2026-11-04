import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import * as path from "node:path";

// lib/kysely.ts: upstream's `db`, resolved per request. On the Worker the
// connection string is the HYPERDRIVE binding's and each request's
// ExecutionContext keeps its own client; without a Cloudflare context it is
// POSTGRES_URL, as upstream had it.
type Ctx = { env: { HYPERDRIVE?: { connectionString: string } }; ctx: object };
let cf: Ctx | null = null;
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    if (!cf) throw new Error("no Cloudflare context");
    return cf;
  },
}));
const postgresMock = vi.fn((cs: string, options: object) => ({ cs, options }));
vi.mock("postgres", () => ({ default: postgresMock }));
vi.mock("kysely-postgres-js", () => ({
  PostgresJSDialect: class {
    constructor(public config: { postgres: unknown }) {}
  },
}));
vi.mock("kysely", () => ({
  Kysely: class {
    constructor(public config: { dialect: { config: { postgres: unknown } } }) {}
    whoAmI() {
      return this;
    }
  },
  sql: () => ({}),
}));

beforeEach(() => {
  postgresMock.mockClear();
  cf = null;
  delete process.env.POSTGRES_URL;
  vi.resetModules();
});

async function kysely() {
  const { db } = await import("@/lib/kysely");
  return db as unknown as { config: { dialect: { config: { postgres: unknown } } }; whoAmI(): unknown };
}

describe("db (lib/kysely.ts)", () => {
  it("connects through the Hyperdrive binding on the Worker", async () => {
    cf = { env: { HYPERDRIVE: { connectionString: "postgres://hyperdrive/db" } }, ctx: {} };
    const db = await kysely();
    expect(db.config.dialect.config.postgres).toEqual({
      cs: "postgres://hyperdrive/db",
      options: { max: 5, prepare: false },
    });
  });

  it("leaves postgres.js's type fetch on: kysely-postgres-js reserves a connection, and a reserve never resolves with fetch_types off", async () => {
    cf = { env: { HYPERDRIVE: { connectionString: "postgres://hyperdrive/db" } }, ctx: {} };
    const db = await kysely();
    db.whoAmI();
    expect(postgresMock.mock.calls[0]![1]).not.toHaveProperty("fetch_types");
  });

  it("keeps one client per request and a new one for the next", async () => {
    const first = {};
    cf = { env: { HYPERDRIVE: { connectionString: "postgres://hyperdrive/db" } }, ctx: first };
    const db = await kysely();
    const a = db.whoAmI();
    expect(db.whoAmI()).toBe(a);
    expect(postgresMock).toHaveBeenCalledTimes(1);
    cf = { env: cf.env, ctx: {} };
    expect(db.whoAmI()).not.toBe(a);
    expect(postgresMock).toHaveBeenCalledTimes(2);
    cf = { env: cf.env, ctx: first };
    expect(db.whoAmI()).toBe(a);
  });

  it("falls back to POSTGRES_URL without a Cloudflare context", async () => {
    process.env.POSTGRES_URL = "postgres://local/db";
    const db = await kysely();
    db.whoAmI();
    expect(postgresMock).toHaveBeenCalledWith("postgres://local/db", { ssl: "require" });
  });
});

describe("timeAgo (lib/utils.ts)", () => {
  it("formats a past timestamp as a relative duration", async () => {
    const { timeAgo } = await import("@/lib/utils");
    expect(timeAgo(new Date(Date.now() - 2 * 60 * 60 * 1000))).toBe("2h ago");
    expect(timeAgo(new Date(Date.now() - 5000), true)).toBe("5s");
    expect(timeAgo(undefined as unknown as Date)).toBe("never");
  });
});

describe("Table (components/table.tsx)", () => {
  // The page never creates the table (the migrations do, before the Worker
  // serves); it seeds the three profiles the first time it finds it empty.
  const rows = [
    { id: 1, name: "Ada", email: "ada@example.com", image: "https://images.ctfassets.net/a.jpg", createdAt: new Date() },
  ];
  async function render(results: Array<unknown[] | Error>) {
    vi.resetModules();
    let calls = 0;
    const filtered: number[] = [];
    const run = async () => {
      const r = results[Math.min(calls, results.length - 1)];
      calls += 1;
      if (r instanceof Error) throw r;
      return r;
    };
    // Kysely's builder: selectFrom().selectAll(), executed as is or narrowed with .where().
    const db = {
      selectFrom: () => ({
        selectAll: () => ({
          execute: run,
          where: () => ({
            execute: () => {
              filtered.push(calls);
              return run();
            },
          }),
        }),
      }),
    };
    const seed = vi.fn(async () => ({}));
    vi.doMock("@/lib/kysely", () => ({ db, sql: () => ({}) }));
    vi.doMock("@/lib/seed", () => ({ seed }));
    vi.doMock("next/image", () => ({ default: (p: { alt: string }) => <img alt={p.alt} /> }));
    vi.doMock("@/components/refresh-button", () => ({ default: () => null }));
    const { default: Table } = await import("@/components/table");
    return { html: renderToStaticMarkup(await Table()), seed, selects: () => calls, filtered };
  }

  it("renders the users without writing when the table has rows", async () => {
    const { html, seed, selects } = await render([rows]);
    expect(seed).not.toHaveBeenCalled();
    expect(selects()).toBe(1);
    expect(html).toContain("Recent Users");
    expect(html).toContain("Fetched 1 users in");
    expect(html).toContain("ada@example.com");
  });

  it("seeds an empty table, then renders what it wrote", async () => {
    const { html, seed, selects } = await render([[], rows]);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(selects()).toBe(2);
    expect(html).toContain("Fetched 1 users in");
  });

  it("reads the seed back with a query Hyperdrive will not answer from its cache", async () => {
    const { filtered } = await render([[], rows]);
    // the first select is plain (cacheable); only the read-back is narrowed
    expect(filtered).toEqual([1]);
    const table = readFileSync(path.resolve(__dirname, "../../../apps/web/components/table.tsx"), "utf8");
    expect(table).toMatch(/\.where\(sql<boolean>`now\(\) is not null`\)/);
  });

  it("says the migrations have not run instead of creating the table", async () => {
    const { html, seed } = await render([new Error('relation "profiles" does not exist')]);
    expect(seed).not.toHaveBeenCalled();
    expect(html).toContain('data-schema="missing"');
    expect(html).toContain("db:migrate");
    expect(html).not.toContain("Recent Users");
  });

  it("lets any other database error through", async () => {
    await expect(render([new Error("connection refused")])).rejects.toThrow("connection refused");
  });
});

describe("seed (lib/seed.ts)", () => {
  it("only inserts — idempotently, on the unique email — and never creates the table", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/seed"); // the Table tests above replace it
    const statements: string[] = [];
    const ran: unknown[] = [];
    const db = { marker: "db" };
    const sql = (strings: TemplateStringsArray) => ({
      execute: async (on: unknown) => {
        statements.push(strings.join("?"));
        ran.push(on);
        return { rows: [] };
      },
    });
    vi.doMock("@/lib/kysely", () => ({ db, sql }));
    const { seed } = await import("@/lib/seed");
    await seed();
    expect(statements).toHaveLength(3);
    expect(ran).toEqual([db, db, db]);
    for (const s of statements) {
      expect(s).toMatch(/INSERT INTO profiles/);
      expect(s).toMatch(/ON CONFLICT \(email\) DO NOTHING/);
      expect(s).not.toMatch(/CREATE/i);
    }
  });
});
