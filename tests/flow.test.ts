import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { Service } from "../apps/api/src/service";
import { migrate, type DB } from "../apps/api/src/db";
import { newTotpSecret, totp } from "../apps/api/src/security";
async function fixture() {
  const pg = new PGlite();
  const db: DB = {
    query: async (sql, params) => {
      if (params?.length) return pg.query(sql, params);
      return (await pg.exec(sql)).at(-1) ?? { rows: [] };
    },
  };
  await migrate(db);
  return { pg, svc: new Service(db, "a".repeat(64), "b".repeat(64)) };
}
test("complete admin + enrollment + queue + audit lifecycle", async () => {
  const { pg, svc } = await fixture();
  try {
    const secret = newTotpSecret(),
      step = Math.floor(Date.now() / 30000);
    await svc.setup(
      {
        token: "b".repeat(64),
        username: "admin",
        password: "correct strong password",
        secret,
        code: totp(secret, step - 1),
      },
      "setup",
    );
    await assert.rejects(() =>
      svc.login(
        {
          username: "admin",
          password: "correct strong password",
          code: totp(secret, step - 1),
        },
        "login",
      ),
    );
    const session = await svc.login(
      {
        username: "admin",
        password: "correct strong password",
        code: totp(secret, step),
      },
      "login",
    );
    assert.equal((await svc.admin(session)).username, "admin");
    await assert.rejects(() => svc.admin("bad"));
    const invite = await svc.createDevice(
      { name: "PC-01", role: "station" },
      "admin",
    );
    const agent = await svc.enroll({ token: invite.token }, "enroll");
    await assert.rejects(() => svc.enroll({ token: invite.token }, "enroll"));
    const d = await svc.device(agent.token);
    await svc.heartbeat(d, {
      telemetry: { hostname: "PC-01", version: "0.1.0", os: "Windows" },
      capabilities: ["inventory", "reboot"],
    });
    await assert.rejects(() =>
      svc.command({ deviceId: d.id, kind: "unlock" }, "admin"),
    );
    const cmd = await svc.command(
      { deviceId: d.id, kind: "inventory" },
      "admin",
    );
    const leased = await svc.poll(d);
    assert.equal(cmd.id, leased.id);
    assert.equal(await svc.poll(d), null);
    await assert.rejects(() =>
      svc.ack(d, { id: cmd.id, lease: "c".repeat(64), ok: true }),
    );
    await svc.ack(d, { id: cmd.id, lease: leased.lease, ok: true });
    await assert.rejects(() =>
      svc.ack(d, { id: cmd.id, lease: leased.lease, ok: true }),
    );
    await svc.credential(
      { integration: "steam", username: "user", password: "DO-NOT-LEAK" },
      "admin",
    );
    const overview = await svc.overview();
    assert.equal(overview.commands[0].status, "succeeded");
    assert(!JSON.stringify(overview).includes("DO-NOT-LEAK"));
    assert(!JSON.stringify(overview).includes(agent.token));
    assert(overview.audit.length >= 5);
  } finally {
    await pg.close();
  }
});
test("gateway isolation, expiry, scheduling claim and idempotent migrations", async () => {
  const { pg, svc } = await fixture();
  try {
    await migrate(svc.db);
    const invite = await svc.createDevice(
      { name: "Gateway", role: "gateway" },
      "admin",
    );
    const agent = await svc.enroll({ token: invite.token }, "ip");
    const d = await svc.device(agent.token);
    await svc.heartbeat(d, {
      telemetry: { hostname: "Gateway", version: "0.1.0", os: "Windows" },
      capabilities: ["wol", "steam_update"],
    });
    await svc.command(
      { deviceId: d.id, kind: "wol", payload: { mac: "AA:BB:CC:DD:EE:FF" } },
      "admin",
    );
    await assert.rejects(() =>
      svc.command(
        { deviceId: d.id, kind: "wol", payload: { mac: "malicious" } },
        "admin",
      ),
    );
    await svc.schedule(
      {
        deviceId: d.id,
        name: "Terça",
        appId: 90,
        weekday: 2,
        hour: 4,
        minute: 0,
      },
      "admin",
    );
    const date = new Date("2026-10-13T07:00:01Z");
    await svc.tick(date);
    await svc.tick(date);
    assert.equal(
      (await svc.db.query("SELECT id FROM commands WHERE source='schedule'"))
        .rows.length,
      1,
    );
    await svc.db.query(
      "UPDATE commands SET expires_at=now()-interval '1 minute'",
    );
    await svc.tick();
    assert(
      (await svc.overview()).commands.every((c) => c.status === "expired"),
    );
    await svc.db.query("UPDATE devices SET revoked=true WHERE id=$1", [d.id]);
    await assert.rejects(() => svc.device(agent.token));
  } finally {
    await pg.close();
  }
});
test("persistent rate limits stop brute force", async () => {
  const { pg, svc } = await fixture();
  try {
    for (let i = 0; i < 10; i++) await svc.limit("attacker");
    await assert.rejects(() => svc.limit("attacker"), /Muitas tentativas/);
  } finally {
    await pg.close();
  }
});
