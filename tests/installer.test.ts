import { test } from "node:test";
import assert from "node:assert/strict";
import { installerTrailer } from "../apps/api/src/installer";
test("installer frame uses a bounded UTF8 JSON and rejects malformed capabilities", () => {
  const settings = {
    serverUrl: "https://lan.test",
    token: "a".repeat(64),
    expiresAt: "2026-10-16T00:00:00.000Z",
  };
  const frame = installerTrailer(settings);
  assert.equal(frame.subarray(-8).toString(), "LANSET01");
  const size = frame.readUInt32LE(frame.length - 12);
  assert.equal(size, frame.length - 12);
  assert.deepEqual(JSON.parse(frame.subarray(0, size).toString()), settings);
  assert.throws(() =>
    installerTrailer({ ...settings, serverUrl: "http://lan.test" }),
  );
  assert.throws(() => installerTrailer({ ...settings, token: "short" }));
});
