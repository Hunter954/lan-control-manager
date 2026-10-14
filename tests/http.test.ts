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
      409,
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
