/**
 * Database tests: run against the local Supabase database (`npm run db:start` first).
 *   npm run test:db
 * Skipped automatically when TEST_DATABASE_URL isn't set (e.g. plain `npm test`).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_URL = process.env.TEST_DATABASE_URL;
const EMAIL_DOMAIN = "@db-test.offer-brain.local";

/** Same database, connected as the role Supabase Auth itself uses to create users. */
function authAdminUrl(url: string): string {
  const u = new URL(url);
  u.username = "supabase_auth_admin";
  return u.toString();
}

/** Creates an auth user exactly the way Supabase Auth does, which fires the signup trigger. */
async function createUser(authPool: pg.Pool, label: string): Promise<string> {
  const id = randomUUID();
  await authPool.query(
    `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), now())`,
    [id, `${label}-${id.slice(0, 8)}${EMAIL_DOMAIN}`],
  );
  return id;
}

/** Runs `fn` inside a transaction as the given signed-in user (RLS applies). */
async function asUser<T>(pool: pg.Pool, userId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (err) {
    await c.query("rollback").catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

const pgCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return "ok";
  } catch (err) {
    return (err as { code?: string }).code ?? String(err);
  }
};

describe.skipIf(!DB_URL)("database (local Supabase)", () => {
  let pool: pg.Pool;
  let authPool: pg.Pool;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DB_URL, max: 25 });
    authPool = new pg.Pool({ connectionString: authAdminUrl(DB_URL!), max: 2 });
    userA = await createUser(authPool, "a");
    userB = await createUser(authPool, "b");
  });

  afterAll(async () => {
    await authPool?.query(`delete from auth.users where email like $1`, [`%${EMAIL_DOMAIN}`]);
    await authPool?.end();
    await pool?.end();
  });

  it("signup creates a brand_settings row and the 5 default personas (all active)", async () => {
    const { rows: brand } = await pool.query("select * from public.brand_settings where user_id = $1", [userA]);
    expect(brand).toHaveLength(1);
    const { rows: personas } = await pool.query(
      "select name, active from public.personas where user_id = $1 order by sort_order",
      [userA],
    );
    expect(personas.map((p) => p.name)).toEqual([
      "The Skeptic",
      "The Busy Beginner",
      "The Ready Buyer",
      "The Scroller",
      "The Expert Peer",
    ]);
    expect(personas.every((p) => p.active)).toBe(true);
  });

  describe("max 10 active personas", () => {
    it("allows up to 10 active, rejects the 11th with check_violation (23514)", async () => {
      await asUser(pool, userA, async (c) => {
        for (let i = 1; i <= 5; i++) {
          await c.query("insert into public.personas (name, active) values ($1, true)", [`Extra ${i}`]);
        }
      });
      const code = await pgCode(
        asUser(pool, userA, (c) => c.query("insert into public.personas (name, active) values ('Eleventh', true)")),
      );
      expect(code).toBe("23514");
      const { rows } = await pool.query("select count(*)::int as n from public.personas where user_id = $1 and active", [userA]);
      expect(rows[0].n).toBe(10);
    });

    it("an 11th persona can be added switched off, but not switched on", async () => {
      const id = await asUser(pool, userA, async (c) => {
        const { rows } = await c.query("insert into public.personas (name, active) values ('Spare', false) returning id");
        return rows[0].id as string;
      });
      const code = await pgCode(
        asUser(pool, userA, (c) => c.query("update public.personas set active = true where id = $1", [id])),
      );
      expect(code).toBe("23514");
    });

    it("editing an active persona at the limit still works", async () => {
      const code = await pgCode(
        asUser(pool, userA, (c) =>
          c.query("update public.personas set description = 'edited', active = true where name = 'Extra 1'"),
        ),
      );
      expect(code).toBe("ok");
    });

    it("20 simultaneous activations never exceed 10 (no race condition)", async () => {
      const userC = await createUser(authPool, "c"); // starts with 5 active
      const attempts = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          pgCode(
            asUser(pool, userC, async (cl) => {
              await cl.query("insert into public.personas (name, active) values ($1, true)", [`Racer ${i}`]);
              await cl.query("select pg_sleep(0.02)"); // hold the transaction open briefly
            }),
          ),
        ),
      );
      expect(attempts.filter((r) => r === "ok")).toHaveLength(5);
      expect(attempts.filter((r) => r === "23514")).toHaveLength(15);
      const { rows } = await pool.query("select count(*)::int as n from public.personas where user_id = $1 and active", [userC]);
      expect(rows[0].n).toBe(10);
    });
  });

  describe("row level security", () => {
    it("user B cannot see or change user A's personas", async () => {
      const seen = await asUser(pool, userB, async (c) => {
        const { rows } = await c.query("select * from public.personas where user_id = $1", [userA]);
        const upd = await c.query("update public.personas set name = 'hacked' where user_id = $1", [userA]);
        const del = await c.query("delete from public.personas where user_id = $1", [userA]);
        return { rows: rows.length, updated: upd.rowCount, deleted: del.rowCount };
      });
      expect(seen).toEqual({ rows: 0, updated: 0, deleted: 0 });
    });

    it("user B cannot create rows owned by user A", async () => {
      const code = await pgCode(
        asUser(pool, userB, (c) => c.query("insert into public.offers (user_id, name, cta_type) values ($1, 'x', 'link')", [userA])),
      );
      expect(code).toBe("42501");
    });

    it("a post can't use another user's offer, and a review can't attach to another user's post", async () => {
      const offerId = await asUser(pool, userA, async (c) => {
        const { rows } = await c.query("insert into public.offers (name, cta_type) values ('A offer', 'link') returning id");
        return rows[0].id as string;
      });
      const postId = await asUser(pool, userA, async (c) => {
        const { rows } = await c.query(
          "insert into public.posts (platform, format, goal, hook, offer_id) values ('instagram', 'reel', 'leads', 'A hook', $1) returning id",
          [offerId],
        );
        return rows[0].id as string;
      });

      const postCode = await pgCode(
        asUser(pool, userB, (c) =>
          c.query("insert into public.posts (platform, format, goal, hook, offer_id) values ('instagram', 'reel', 'leads', 'B hook', $1)", [offerId]),
        ),
      );
      expect(postCode).toBe("42501");

      const reviewCode = await pgCode(
        asUser(pool, userB, (c) =>
          c.query(
            `insert into public.reviews (post_id, raw_response, parsed, schema_version, total_score, predicted_tier, confidence, model, brain_version)
             values ($1, 'x', '{}', 1, 50, 'ABOVE', 'LOW', 'm', 'v')`,
            [postId],
          ),
        ),
      );
      expect(reviewCode).toBe("42501");
    });

    it("signed-out visitors (anon) have no access to any table", async () => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query("set local role anon");
        const code = await pgCode(c.query("select * from public.personas"));
        expect(code).toBe("42501");
      } finally {
        await c.query("rollback");
        c.release();
      }
    });

    it("rejects a format that doesn't belong to the platform", async () => {
      const code = await pgCode(
        asUser(pool, userA, (c) =>
          c.query("insert into public.posts (platform, format, goal, hook) values ('youtube', 'reel', 'views', 'x')"),
        ),
      );
      expect(code).toBe("23514");
    });
  });
  describe("results and learning notes (Phase 2)", () => {
    const newPost = (userId: string) =>
      asUser(pool, userId, async (c) => {
        const { rows } = await c.query(
          "insert into public.posts (platform, format, goal, hook) values ('instagram', 'reel', 'leads', 'Results hook') returning id, source",
        );
        return rows[0] as { id: string; source: string };
      });

    it("the owner can save results and notes; new posts default to source 'app'", async () => {
      const post = await newPost(userA);
      expect(post.source).toBe("app");
      const ids = await asUser(pool, userA, async (c) => {
        const { rows: r } = await c.query(
          "insert into public.results (post_id, views, dms, performance_index) values ($1, 12000, 31, 1.35) returning id, source",
          [post.id],
        );
        const { rows: n } = await c.query(
          "insert into public.calibration_notes (post_id, result_id) values ($1, $2) returning id, status",
          [post.id, r[0].id],
        );
        return { result: r[0], note: n[0] };
      });
      expect(ids.result.source).toBe("manual");
      expect(ids.note.status).toBe("pending");
    });

    it("user B can't attach results or notes to user A's post, or read A's", async () => {
      const post = await newPost(userA);
      await asUser(pool, userA, (c) => c.query("insert into public.results (post_id, views) values ($1, 10)", [post.id]));
      const resultCode = await pgCode(
        asUser(pool, userB, (c) => c.query("insert into public.results (post_id, views) values ($1, 999)", [post.id])),
      );
      expect(resultCode).toBe("42501");
      const noteCode = await pgCode(
        asUser(pool, userB, (c) => c.query("insert into public.calibration_notes (post_id) values ($1)", [post.id])),
      );
      expect(noteCode).toBe("42501");
      const seen = await asUser(pool, userB, async (c) => {
        const { rows } = await c.query("select * from public.results where post_id = $1", [post.id]);
        const upd = await c.query("update public.results set views = 0 where post_id = $1", [post.id]);
        return { rows: rows.length, updated: upd.rowCount };
      });
      expect(seen).toEqual({ rows: 0, updated: 0 });
    });

    it("rejects impossible numbers", async () => {
      const post = await newPost(userA);
      const pct = await pgCode(
        asUser(pool, userA, (c) => c.query("insert into public.results (post_id, hold_3s_pct) values ($1, 120)", [post.id])),
      );
      const negative = await pgCode(
        asUser(pool, userA, (c) => c.query("insert into public.results (post_id, likes) values ($1, -1)", [post.id])),
      );
      const source = await pgCode(
        asUser(pool, userA, (c) =>
          c.query("insert into public.posts (platform, format, goal, hook, source) values ('instagram', 'reel', 'views', 'x', 'api')"),
        ),
      );
      expect([pct, negative, source]).toEqual(["23514", "23514", "23514"]);
    });

    it("deleting a post deletes its results and notes", async () => {
      const post = await newPost(userA);
      await asUser(pool, userA, async (c) => {
        const { rows } = await c.query("insert into public.results (post_id, views) values ($1, 10) returning id", [post.id]);
        await c.query("insert into public.calibration_notes (post_id, result_id) values ($1, $2)", [post.id, rows[0].id]);
        await c.query("delete from public.posts where id = $1", [post.id]);
      });
      const { rows } = await pool.query(
        "select (select count(*) from public.results where post_id = $1)::int + (select count(*) from public.calibration_notes where post_id = $1)::int as n",
        [post.id],
      );
      expect(rows[0].n).toBe(0);
    });

    it("a result or note can't be moved onto someone else's post, or point at another post's review", async () => {
      const mine = await newPost(userA);
      const theirs = await newPost(userB);
      const otherMine = await newPost(userA);
      const ids = await asUser(pool, userA, async (c) => {
        const { rows: r } = await c.query("insert into public.results (post_id, views) values ($1, 1) returning id", [mine.id]);
        const { rows: rv } = await c.query(
          `insert into public.reviews (post_id, raw_response, parsed, schema_version, total_score, predicted_tier, confidence, model, brain_version)
           values ($1, 'x', '{}', 1, 50, 'ABOVE', 'LOW', 'm', 'v') returning id`,
          [otherMine.id],
        );
        return { result: r[0].id as string, otherReview: rv[0].id as string };
      });
      const moveResult = await pgCode(
        asUser(pool, userA, (c) => c.query("update public.results set post_id = $1 where id = $2", [theirs.id, ids.result])),
      );
      expect(moveResult).toBe("42501");
      const wrongReview = await pgCode(
        asUser(pool, userA, (c) =>
          c.query("insert into public.calibration_notes (post_id, review_id) values ($1, $2)", [mine.id, ids.otherReview]),
        ),
      );
      expect(wrongReview).toBe("42501");
    });

    it("latest_results shows each post's newest save, only to its owner", async () => {
      const post = await newPost(userA);
      await asUser(pool, userA, async (c) => {
        await c.query("insert into public.results (post_id, views, performance_index, created_at) values ($1, 100, 0.5, now() - interval '1 hour')", [post.id]);
        await c.query("insert into public.results (post_id, views, performance_index, collected_at) values ($1, 200, 1.5, now() - interval '3 days')", [post.id]);
      });
      const mine = await asUser(pool, userA, async (c) => {
        const { rows } = await c.query("select views::int, performance_index::float, root_id from public.latest_results where post_id = $1", [post.id]);
        return rows;
      });
      expect(mine).toEqual([{ views: 200, performance_index: 1.5, root_id: post.id }]);
      const theirs = await asUser(pool, userB, async (c) => {
        const { rows } = await c.query("select * from public.latest_results where post_id = $1", [post.id]);
        return rows.length;
      });
      expect(theirs).toBe(0);
    });

    it("import_csv_batch saves posts and results together, or nothing at all", async () => {
      const good = randomUUID();
      const count = await asUser(pool, userA, async (c) => {
        const { rows } = await c.query("select public.import_csv_batch($1::jsonb) as n", [
          JSON.stringify([{ id: good, platform: "tiktok", format: "video", goal: "views", hook: "CSV hook", posted_at: "2026-09-01T12:00:00Z", views: 5000, performance_index: 1.2 }]),
        ]);
        return rows[0].n;
      });
      expect(count).toBe(1);
      const { rows: saved } = await pool.query(
        "select p.source, p.status, r.source as result_source, r.views::int from public.posts p join public.results r on r.post_id = p.id where p.id = $1",
        [good],
      );
      expect(saved).toEqual([{ source: "csv", status: "posted", result_source: "csv", views: 5000 }]);

      const ok = randomUUID();
      const code = await pgCode(
        asUser(pool, userA, (c) =>
          c.query("select public.import_csv_batch($1::jsonb)", [
            JSON.stringify([
              { id: ok, platform: "tiktok", format: "video", goal: "views", hook: "Fine row", views: 10 },
              { id: randomUUID(), platform: "tiktok", format: "video", goal: "views", hook: "Bad row", hold_3s_pct: 150 },
            ]),
          ]),
        ),
      );
      expect(code).toBe("23514");
      const { rows: leftover } = await pool.query("select 1 from public.posts where id = $1", [ok]);
      expect(leftover).toHaveLength(0);
    });

    it("signed-out visitors can't call the import function", async () => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query("set local role anon");
        expect(await pgCode(c.query("select public.import_csv_batch('[]'::jsonb)"))).toBe("42501");
      } finally {
        await c.query("rollback");
        c.release();
      }
    });

    it("signed-out visitors (anon) can't read results", async () => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query("set local role anon");
        expect(await pgCode(c.query("select * from public.results"))).toBe("42501");
      } finally {
        await c.query("rollback");
        c.release();
      }
    });
  });
});
