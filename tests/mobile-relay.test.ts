import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { PGlite } from "@electric-sql/pglite";
import { Service } from "../apps/api/src/service";
import { migrate, type DB } from "../apps/api/src/db";
import { attachMobileRelay } from "../apps/api/src/mobile-relay";
import { newTotpSecret, totp } from "../apps/api/src/security";
function connect(url: string, headers: any) {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
    ws.once("unexpected-response", (_req, res) => {
      ws.terminate();
      reject(new Error("Denied " + res.statusCode));
    });
  });
}
function message(ws: WebSocket) {
  return new Promise<{ data: Buffer; binary: boolean }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Message timeout")), 2000);
    ws.once("message", (data, binary) => {
      clearTimeout(timer);
      resolve({ data: Buffer.from(data as Buffer), binary });
    });
  });
}
test("Android relay enforces session authentication, local consent, role and revocation", async (t) => {
  const pg = new PGlite();
  const db: DB = {
    query: async (s, p) =>
      p?.length ? pg.query(s, p) : ((await pg.exec(s)).at(-1) ?? { rows: [] }),
  };
  await migrate(db);
  const svc = new Service(db, "a".repeat(64), "b".repeat(64));
  const secret = newTotpSecret(),
    step = Math.floor(Date.now() / 30000);
  await svc.setup(
    {
      token: "b".repeat(64),
      username: "admin",
      password: "long strong password",
      secret,
      code: totp(secret, step - 1),
    },
    "ip",
  );
  const session = await svc.login(
    {
      username: "admin",
      password: "long strong password",
      code: totp(secret, step),
    },
    "ip",
  );
  const invite = await svc.createDevice({ role: "android" }, "admin");
  const phoneIdentity = await svc.enroll(
    { token: invite.token, hostname: "Tablet QA" },
    "android",
  );
  const server = createServer();
  t.mock.timers.enable({ apis: ["setInterval"] });
  const realNow = Date.now.bind(Date);
  let elapsed = 0;
  t.mock.method(Date, "now", () => realNow() + elapsed);
  const relay = attachMobileRelay(server, svc, "https://lan.test");
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as any).port;
  const url = `ws://127.0.0.1:${port}/api/mobile/live?device=${invite.id}`;
  let phone: WebSocket | undefined, viewer: WebSocket | undefined;
  try {
    await assert.rejects(() => connect(url, { Origin: "https://lan.test" }));
    await assert.rejects(() =>
      connect(url, {
        Origin: "https://evil.test",
        Cookie: "lan_session=" + session,
      }),
    );
    phone = await connect(url, {
      Authorization: "Bearer " + phoneIdentity.token,
    });
    viewer = await connect(url, {
      Origin: "https://lan.test",
      Cookie: "lan_session=" + session,
    });
    let p = message(viewer);
    phone.send(
      JSON.stringify({
        type: "status",
        mode: "screen",
        control: false,
        width: 640,
        height: 480,
      }),
    );
    assert.equal(JSON.parse((await p).data.toString()).control, false);
    p = message(viewer);
    viewer.send(
      JSON.stringify({ type: "control", action: "tap", x: 0.5, y: 0.5 }),
    );
    assert.equal(JSON.parse((await p).data.toString()).type, "error");
    p = message(viewer);
    phone.send(
      JSON.stringify({
        type: "status",
        mode: "screen",
        control: true,
        width: 640,
        height: 480,
      }),
    );
    await p;
    p = message(phone);
    viewer.send(
      JSON.stringify({ type: "control", action: "tap", x: 0.5, y: 0.5 }),
    );
    assert.equal(JSON.parse((await p).data.toString()).action, "tap");
    p = message(viewer);
    const frame = Buffer.from([255, 216, 1, 2, 3, 255, 217]);
    phone.send(frame);
    const received = await p;
    assert(received.binary);
    assert(received.data.equals(frame));
    p = message(viewer);
    viewer.send(JSON.stringify({ type: "control", action: "front" }));
    assert.equal(JSON.parse((await p).data.toString()).type, "error");
    p = message(viewer);
    phone.send(
      JSON.stringify({
        type: "status",
        mode: "camera",
        control: false,
        facing: "rear",
      }),
    );
    await p;
    p = message(phone);
    viewer.send(JSON.stringify({ type: "control", action: "front" }));
    assert.equal(JSON.parse((await p).data.toString()).action, "front");
    // Authorized sharing continues beyond 15 minutes while credentials remain valid.
    elapsed = 16 * 60000;
    t.mock.timers.tick(10000);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(phone.readyState, WebSocket.OPEN);
    assert.equal(viewer.readyState, WebSocket.OPEN);
    p = message(viewer);
    phone.send(frame);
    assert((await p).data.equals(frame));
    await db.query("UPDATE devices SET revoked=true WHERE id=$1", [invite.id]);
    p = message(viewer);
    viewer.send(JSON.stringify({ type: "control", action: "rear" }));
    assert.equal(JSON.parse((await p).data.toString()).type, "error");
    const closed = once(phone, "close");
    relay.disconnect(invite.id);
    await closed;
    assert(
      (await svc.overview()).audit.some(
        (a) => a.action === "mobile.viewer.connected",
      ),
    );
  } finally {
    viewer?.terminate();
    phone?.terminate();
    relay.close();
    await new Promise<void>((r) => server.close(() => r()));
    await pg.close();
  }
});
