import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  createHmac,
  timingSafeEqual,
  scryptSync,
} from "node:crypto";
export const token = () => randomBytes(32).toString("hex");
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const equal = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export const hashPassword = (s: string) => {
  const salt = token();
  return `${salt}:${scryptSync(s, salt, 64).toString("hex")}`;
};
export const verifyPassword = (s: string, h: string) => {
  const [salt, hash] = h.split(":");
  return equal(scryptSync(s, salt, 64).toString("hex"), hash);
};
export function encrypt(value: string, key: string) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const data = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}
export function decrypt(value: string, key: string) {
  const [iv, tag, data] = value.split(".").map((x) => Buffer.from(x, "base64"));
  const d = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newTotpSecret() {
  const b = randomBytes(20);
  let bits = "",
    out = "";
  for (const v of b) bits += v.toString(2).padStart(8, "0");
  for (let i = 0; i < bits.length; i += 5)
    out += alphabet[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
export function totp(secret: string, step: number) {
  let bits = "";
  for (const c of secret)
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const o = h[19] & 15;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
export function totpStep(
  secret: string,
  code: string,
  last = -1,
  now = Date.now(),
) {
  const step = Math.floor(now / 30000);
  for (const s of [step, step - 1, step + 1])
    if (s > last && equal(totp(secret, s), code)) return s;
  return null;
}
