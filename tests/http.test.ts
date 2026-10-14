import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate, type DB } from "../apps/api/src/db";
import { start } from "../apps/api/src/main";
import { newTotpSecret, totp } from "../apps/api/src/security";
test("HTTP health, origin protection, 2FA session, protected installer and agent channel", async () => {
  process.env.NODE_ENV = "production";
  process.env.MASTER_KEY = "a".repeat(64);
  process.env.BOOTSTRAP_TOKEN = "b".repeat(64);
  process.env.PUBLIC_URL = "http://lan.test";
  process.env.PORT = "0";
  const pg = new PGlite();
  const db: DB = {
    query: async (s, p) =>
      p?.length ? pg.query(s, p) : ((await pg.exec(s)).at(-1) ?? { rows: [] }),
  };
  await migrate(db);
  const server = await start(db);
  const address = server.app.getHttpServer().address();
  const url = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: any, headers: any = {}) =>
    fetch(url + "/api" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://lan.test",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(url + "/health")).status, 200);
    assert.equal((await fetch(url + "/api/overview")).status, 401);
    assert.equal(
      (await post("/auth/setup", {}, { Origin: "https://evil.test" })).status,
      403,
    );
    const secret = newTotpSecret(),
      step = Math.floor(Date.now() / 30000);
    const setup = await post("/auth/setup", {
      token: "b".repeat(64),
      username: "admin",
      password: "long strong password",
      secret,
      code: totp(secret, step - 1),
    });
    assert.equal(setup.status, 200);
    const login = await post("/auth/login", {
      username: "admin",
      password: "long strong password",
      code: totp(secret, step),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!;
    assert(cookie.includes("HttpOnly"));
    assert(cookie.includes("SameSite=Strict"));
    assert.equal(
      (await fetch(url + "/api/overview", { headers: { Cookie: cookie } }))
        .status,
      200,
    );
    assert.equal(
      (await fetch(url + "/api/installer", { headers: { Cookie: cookie } }))
        .status,
      405,
    );
    const invite = await (
      await post(
        "/devices",
        { name: "PC-HTTP", role: "station" },
        { Cookie: cookie },
      )
    ).json();
    const enroll = await (
      await post("/agent/enroll", { token: invite.token })
    ).json();
    assert(enroll.token);
    assert.equal(
      (
        await fetch(url + "/api/agent/poll", {
          headers: { Authorization: "Bearer " + enroll.token },
        })
      ).status,
      200,
    );
    await post("/auth/logout", {}, { Cookie: cookie });
    assert.equal(
      (await fetch(url + "/api/overview", { headers: { Cookie: cookie } }))
        .status,
      401,
    );
  } finally {
    await server.close();
    await pg.close();
  }
});

test("personalized EXE streams an embedded invite and enrolls the Windows identity once", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } =
    await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "lan-installer-"));
  mkdirSync(join(dir, "releases"));
  const binary = Buffer.from("MZ-test-installer");
  writeFileSync(join(dir, "releases", "LANControl.Installer.exe"), binary);
  process.env.DATA_DIR = dir;
  process.env.NODE_ENV = "production";
  process.env.MASTER_KEY = "a".repeat(64);
  process.env.BOOTSTRAP_TOKEN = "b".repeat(64);
  process.env.PUBLIC_URL = "https://lan.test";
  process.env.PORT = "0";
  const pg = new PGlite();
  const db: DB = {
    query: async (s, p) =>
      p?.length ? pg.query(s, p) : ((await pg.exec(s)).at(-1) ?? { rows: [] }),
  };
  await migrate(db);
  const server = await start(db);
  const port = server.app.getHttpServer().address().port;
  const url = `http://127.0.0.1:${port}`;
  const post = (p: string, body: any, cookie = "") =>
    fetch(url + "/api" + p, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://lan.test",
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    });
  try {
    const secret = newTotpSecret(),
      step = Math.floor(Date.now() / 30000);
    assert.equal(
      (
        await post("/auth/setup", {
          token: "b".repeat(64),
          username: "admin",
          password: "long strong password",
          secret,
          code: totp(secret, step - 1),
        })
      ).status,
      200,
    );
    const login = await post("/auth/login", {
      username: "admin",
      password: "long strong password",
      code: totp(secret, step),
    });
    const cookie = login.headers.get("set-cookie")!;
    assert.equal((await post("/installer", { role: "station" })).status, 401);
    const response = await post("/installer", { role: "station" }, cookie);
    assert.equal(response.status, 200);
    assert(response.headers.get("content-disposition")?.includes(".exe"));
    assert.equal(response.headers.get("cache-control"), "no-store");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(bytes.subarray(0, binary.length).equals(binary));
    assert.equal(bytes.subarray(-8).toString(), "LANSET01");
    const length = bytes.readUInt32LE(bytes.length - 12);
    const settings = JSON.parse(
      bytes.subarray(bytes.length - 12 - length, bytes.length - 12).toString(),
    );
    assert.equal(settings.serverUrl, "https://lan.test");
    assert(Date.parse(settings.expiresAt) > Date.now() + 47 * 3600000);
    const enrolled = await post("/agent/enroll", {
      token: settings.token,
      hostname: "LAN-PC-07",
      mac: "AA:BB:CC:DD:EE:FF",
    });
    assert.equal(enrolled.status, 200);
    const record = await enrolled.json();
    assert.equal(record.name, "LAN-PC-07");
    assert.equal(
      (
        await post("/agent/enroll", {
          token: settings.token,
          hostname: "OTHER-PC",
        })
      ).status,
      401,
    );
    const device = (
      await db.query("SELECT * FROM devices WHERE id=$1", [record.id])
    ).rows[0];
    assert.equal(device.name_source, "windows");
    assert.equal(device.mac, "AA:BB:CC:DD:EE:FF");
    assert.equal(device.enrollment_hash, null);
    const second = await post("/installer", { role: "gateway" }, cookie);
    assert.equal(second.status, 200);
    await second.arrayBuffer();
    assert.equal(
      (await db.query("SELECT id FROM devices WHERE role='gateway'")).rows
        .length,
      1,
    );
  } finally {
    await server.close();
    await pg.close();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  }
});
