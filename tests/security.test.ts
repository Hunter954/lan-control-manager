import { test } from "node:test";
import assert from "node:assert/strict";
import {
  totp,
  totpStep,
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
} from "../apps/api/src/security";
test("RFC 6238 code, replay rejection and clock window", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totp(secret, 1), "287082");
  assert.equal(totpStep(secret, "287082", -1, 59000), 1);
  assert.equal(totpStep(secret, "287082", 1, 59000), null);
  assert.equal(totpStep(secret, "000000", -1, 59000), null);
});
test("credentials authenticate ciphertext and passwords are salted", () => {
  const key = "a".repeat(64);
  const ciphertext = encrypt("secret", key);
  assert.equal(decrypt(ciphertext, key), "secret");
  assert.throws(() => decrypt(ciphertext, "b".repeat(64)));
  const hash = hashPassword("strong passphrase");
  assert(verifyPassword("strong passphrase", hash));
  assert(!verifyPassword("wrong", hash));
  assert.notEqual(hash, hashPassword("strong passphrase"));
});
