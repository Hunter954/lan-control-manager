import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { zipSync, unzipSync } from "fflate";
function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Android signing timeout"));
    }, 90000);
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Android signing tool unavailable"));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error("Android signing failed"));
    });
  });
}
let queue = Promise.resolve();
export async function personalizeApk(
  template: string,
  settings: { serverUrl: string; token: string; expiresAt: string },
  dataDir: string,
) {
  let release!: () => void;
  const previous = queue;
  queue = new Promise<void>((r) => (release = r));
  await previous;
  const dir = mkdtempSync(join(tmpdir(), "lan-apk-"));
  try {
    const securityDir = join(dataDir, "android-signing");
    mkdirSync(securityDir, { recursive: true, mode: 0o700 });
    const keystore = join(securityDir, "lan-control.p12"),
      passfile = join(securityDir, "password");
    if (existsSync(keystore) !== existsSync(passfile))
      throw new Error(
        "APK signing identity incomplete; restore the signing backup",
      );
    if (!existsSync(passfile))
      writeFileSync(passfile, randomBytes(32).toString("hex"), { mode: 0o600 });
    const env = {
      ...process.env,
      LAN_APK_PASSWORD: readFileSync(passfile, "utf8"),
      LD_LIBRARY_PATH: join(
        process.env.ANDROID_TOOLS_DIR ?? "/app/android-tools",
        "lib64",
      ),
    };
    if (!existsSync(keystore)) {
      try {
        await run(
          "keytool",
          [
            "-genkeypair",
            "-storetype",
            "PKCS12",
            "-keystore",
            keystore,
            "-storepass:env",
            "LAN_APK_PASSWORD",
            "-alias",
            "lancontrol",
            "-keyalg",
            "RSA",
            "-keysize",
            "3072",
            "-validity",
            "3650",
            "-dname",
            "CN=LAN Control Manager",
          ],
          env,
        );
      } catch (e) {
        rmSync(keystore, { force: true });
        rmSync(passfile, { force: true });
        throw e;
      }
    }
    chmodSync(keystore, 0o600);
    const entries = unzipSync(readFileSync(template));
    entries["assets/enrollment.json"] = Buffer.from(JSON.stringify(settings));
    const unsigned = join(dir, "unsigned.apk"),
      aligned = join(dir, "aligned.apk"),
      signed = join(dir, "LANControl-Android.apk");
    writeFileSync(unsigned, zipSync(entries, { level: 0 }), { mode: 0o600 });
    const tools = process.env.ANDROID_TOOLS_DIR ?? "/app/android-tools";
    await run(join(tools, "zipalign"), ["-f", "4", unsigned, aligned], env);
    await run(
      "java",
      [
        "-jar",
        join(tools, "apksigner.jar"),
        "sign",
        "--ks",
        keystore,
        "--ks-pass",
        "env:LAN_APK_PASSWORD",
        "--ks-key-alias",
        "lancontrol",
        "--out",
        signed,
        aligned,
      ],
      env,
    );
    await run(
      "java",
      ["-jar", join(tools, "apksigner.jar"), "verify", signed],
      env,
    );
    return {
      path: signed,
      cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  } finally {
    release();
  }
}
