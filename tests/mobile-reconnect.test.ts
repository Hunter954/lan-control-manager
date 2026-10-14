import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { attachMobileRelay } from "../apps/api/src/mobile-relay";
import type { Service } from "../apps/api/src/service";

function nextMessage(ws: WebSocket) {
  return new Promise<Buffer>((resolve) =>
    ws.once("message", (data) => resolve(Buffer.from(data as Buffer))),
  );
}

test("viewer refresh resumes the same capture; timeout, stop and revocation end it", async (t) => {
  const id = randomUUID();
  let revoked = false;
  const svc = {
    admin: async (session: string) => {
      if (session !== "test-admin-session") throw Error("Denied");
      return { username: "admin" };
    },
    device: async (token: string) => {
      if (revoked || token !== "test-phone-token") throw Error("Denied");
      return { id, role: "android" };
    },
    db: { query: async () => ({ rows: [{ id, role: "android", revoked }] }) },
    audit: async () => {},
  } as unknown as Service;
  const server = createServer();
  const relay = attachMobileRelay(server, svc, "https://lan.test");
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `ws://127.0.0.1:${(server.address() as any).port}/api/mobile/live?device=${id}`;
  const sockets = new Set<WebSocket>();
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    relay.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  async function phone() {
    const ws = new WebSocket(url, {
      headers: { Authorization: "Bearer test-phone-token" },
    });
    sockets.add(ws);
    await once(ws, "open");
    return ws;
  }
  async function viewer() {
    const ws = new WebSocket(url, {
      headers: {
        Origin: "https://lan.test",
        Cookie: "lan_session=test-admin-session",
      },
    });
    sockets.add(ws);
    const status = nextMessage(ws);
    await once(ws, "open");
    return { ws, status: JSON.parse((await status).toString()) };
  }
  async function publish(p: WebSocket, v: WebSocket) {
    const status = nextMessage(v);
    p.send(
      JSON.stringify({
        type: "status",
        mode: "camera",
        facing: "front",
        control: false,
        sources: ["screen", "camera"],
      }),
    );
    await status;
  }
  async function detach(v: WebSocket) {
    const closed = once(v, "close");
    v.close();
    await closed;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  const p1 = await phone();
  const first = await viewer();
  await publish(p1, first.ws);
  let receivedStop = false;
  p1.on("message", () => {
    receivedStop = true;
  });
  await detach(first.ws);
  t.mock.timers.tick(59000);
  assert.equal(p1.readyState, WebSocket.OPEN);
  assert.equal(receivedStop, false);
  const resumed = await viewer();
  assert.equal(resumed.status.mode, "camera");
  assert.equal(resumed.status.facing, "front");
  assert.deepEqual(resumed.status.sources, ["screen", "camera"]);
  t.mock.timers.tick(1000); // original expiry was cancelled by the resumed viewer
  assert.equal(receivedStop, false);
  const image = nextMessage(resumed.ws);
  const frame = Buffer.from([255, 216, 1, 2, 255, 217]);
  p1.send(frame);
  assert((await image).equals(frame));

  // Refresh may arrive before the old connection closes: replace only the viewer.
  const replacedClose = once(resumed.ws, "close");
  const replacement = await viewer();
  const [replacedCode] = await replacedClose;
  assert.equal(replacedCode, 1008);
  assert.equal(replacement.status.mode, "camera");
  assert.equal(receivedStop, false);
  assert.equal(p1.readyState, WebSocket.OPEN);
  await detach(replacement.ws);
  const expiredClose = once(p1, "close");
  t.mock.timers.tick(60000);
  const expiredStop = JSON.parse((await nextMessage(p1)).toString());
  assert.equal(expiredStop.action, "stop");
  await expiredClose;

  const p2 = await phone();
  const explicit = await viewer();
  await publish(p2, explicit.ws);
  const stop = nextMessage(p2),
    stoppedClose = once(p2, "close");
  explicit.ws.send(JSON.stringify({ type: "control", action: "stop" }));
  assert.equal(JSON.parse((await stop).toString()).action, "stop");
  await stoppedClose;
  await detach(explicit.ws);

  // HTTP stop uses this same relay action, including during the reconnect window.
  const pendingPhone = await phone();
  const pendingViewer = await viewer();
  await publish(pendingPhone, pendingViewer.ws);
  await detach(pendingViewer.ws);
  const pendingStop = nextMessage(pendingPhone),
    pendingClose = once(pendingPhone, "close");
  relay.stop(id);
  assert.equal(JSON.parse((await pendingStop).toString()).action, "stop");
  await pendingClose;
  t.mock.timers.tick(60000);

  const p3 = await phone();
  const revoke = await viewer();
  await publish(p3, revoke.ws);
  await detach(revoke.ws);
  const revokedClose = once(p3, "close");
  revoked = true;
  relay.disconnect(id);
  const [code] = await revokedClose;
  assert.equal(code, 1008);
  t.mock.timers.tick(60000);
});
