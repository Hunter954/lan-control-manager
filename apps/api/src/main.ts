import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import express, { Request, Response } from "express";
import helmet from "helmet";
import next from "next";
import { existsSync, createReadStream, statSync } from "node:fs";
import { installerTrailer } from "./installer";
import { personalizeApk } from "./android-apk";
import { attachMobileRelay } from "./mobile-relay";
import { resolve } from "node:path";
import { connect, DB } from "./db";
import { Service, HttpError } from "./service";
import { digest } from "./security";
@Module({})
class AppModule {}
export async function start(db: DB) {
  const key = process.env.MASTER_KEY ?? "",
    bootstrap = process.env.BOOTSTRAP_TOKEN ?? "",
    origin = process.env.PUBLIC_URL ?? "";
  if (
    !/^[0-9a-f]{64}$/i.test(key) ||
    bootstrap.length < 32 ||
    !/^https?:\/\//.test(origin)
  )
    throw new Error(
      "Configure DATABASE_URL, MASTER_KEY (64 hex), BOOTSTRAP_TOKEN (32+ chars), PUBLIC_URL",
    );
  const svc = new Service(db, key, bootstrap);
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "32kb" }));
  app.use("/health", async (_req: Request, res: Response) => {
    try {
      await db.query("SELECT 1");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unhealthy" });
    }
  });
  app.use("/api", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const p = req.path,
        b = req.body ?? {},
        ip = req.socket.remoteAddress ?? "unknown";
      const session =
        req.headers.cookie
          ?.split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith("lan_session="))
          ?.slice(12) ?? "";
      const bearer = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
      if (
        req.method !== "GET" &&
        !p.startsWith("/agent/") &&
        req.headers.origin !== origin
      )
        throw new HttpError(403, "Origem inválida");
      if (p === "/auth/setup" && req.method === "POST")
        return res.json(await svc.setup(b, ip));
      if (p === "/auth/login" && req.method === "POST") {
        const t = await svc.login(b, ip);
        res.setHeader(
          "Set-Cookie",
          `lan_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${origin.startsWith("https:") ? "; Secure" : ""}`,
        );
        return res.json({ ok: true });
      }
      if (p === "/agent/enroll" && req.method === "POST")
        return res.json(await svc.enroll(b, ip));
      if (p.startsWith("/agent/")) {
        const d = await svc.device(bearer);
        if (p === "/agent/info" && req.method === "GET")
          return res.json({ id: d.id, role: d.role, name: d.name });
        if (p === "/agent/heartbeat" && req.method === "POST")
          return res.json(await svc.heartbeat(d, b));
        if (p === "/agent/poll" && req.method === "GET")
          return res.json(await svc.poll(d));
        if (p === "/agent/ack" && req.method === "POST")
          return res.json(await svc.ack(d, b));
        throw new HttpError(404, "Rota inexistente");
      }
      const a = await svc.admin(session);
      if (p === "/auth/logout" && req.method === "POST") {
        await db.query("DELETE FROM sessions WHERE token_hash=$1", [
          digest(session),
        ]);
        res.setHeader(
          "Set-Cookie",
          "lan_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        );
        return res.json({ ok: true });
      }
      if (p === "/me" && req.method === "GET") return res.json(a);
      if (p === "/overview" && req.method === "GET")
        return res.json(await svc.overview());
      if (p === "/devices" && req.method === "POST")
        return res.json(await svc.createDevice(b, a.username));
      if (p === "/commands" && req.method === "POST")
        return res.json(await svc.command(b, a.username));
      if (p === "/credentials" && req.method === "POST")
        return res.json(await svc.credential(b, a.username));
      if (p === "/schedules" && req.method === "POST")
        return res.json(await svc.schedule(b, a.username));
      if (p === "/schedule/toggle" && req.method === "POST") {
        const id = String(b.id);
        await db.query("UPDATE schedules SET enabled=NOT enabled WHERE id=$1", [
          id,
        ]);
        await svc.audit(a.username, "schedule.toggled", id);
        return res.json({ ok: true });
      }
      if (p === "/device/revoke" && req.method === "POST") {
        await db.query(
          "UPDATE devices SET revoked=true,token_hash=NULL,enrollment_hash=NULL WHERE id=$1",
          [String(b.id)],
        );
        await db.query(
          "UPDATE commands SET status='expired',lease_hash=NULL WHERE device_id=$1 AND status IN ('queued','leased')",
          [String(b.id)],
        );
        mobileRelay.disconnect(String(b.id));
        await svc.audit(a.username, "device.revoked", String(b.id));
        return res.json({ ok: true });
      }
      if (p === "/reports" && req.method === "GET") {
        const rows = (
          await db.query("SELECT * FROM audit ORDER BY id DESC LIMIT 10000")
        ).rows;
        res.type("text/csv");
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="auditoria.csv"',
        );
        const cell = (x: any) =>
          '"' +
          String(x ?? "")
            .replace(/^[=+\-@]/, "'$&")
            .replace(/"/g, '""') +
          '"';
        return res.send(
          "id,actor,action,target,created_at\n" +
            rows
              .map((r) =>
                [r.id, r.actor, r.action, r.target, r.created_at.toISOString()]
                  .map(cell)
                  .join(","),
              )
              .join("\n"),
        );
      }
      if (p === "/mobile/apk" && req.method === "POST") {
        const dataDir = process.env.DATA_DIR ?? "/data",
          template = resolve(
            dataDir,
            "releases/LANControl-Android-unsigned.apk",
          );
        if (!existsSync(template))
          throw new HttpError(
            409,
            "APK ainda não publicado. Aguarde o deploy.",
          );
        const invite = await svc.createDevice({ role: "android" }, a.username);
        const apk = await personalizeApk(
          template,
          {
            serverUrl: origin,
            token: invite.token,
            expiresAt: invite.expiresAt,
          },
          dataDir,
        );
        await svc.audit(a.username, "android.apk.download", invite.id);
        res.on("close", () => apk.cleanup());
        return res.download(apk.path, "LANControl-Android.apk", () =>
          apk.cleanup(),
        );
      }
      if (p === "/installer" && req.method === "POST") {
        if (!["station", "gateway"].includes(b.role ?? "station"))
          throw new HttpError(400, "Tipo de instalador inválido");
        const path = resolve(
          process.env.DATA_DIR ?? "/data",
          "releases/LANControl.Installer.exe",
        );
        if (!existsSync(path))
          throw new HttpError(
            409,
            "Instalador executável ainda não publicado. Aguarde o deploy.",
          );
        const invite = await svc.createDevice(
          { role: b.role ?? "station" },
          a.username,
        );
        const trailer = installerTrailer({
          serverUrl: origin,
          token: invite.token,
          expiresAt: invite.expiresAt,
        });
        await svc.audit(a.username, "installer.personalized", invite.id);
        res.type("application/octet-stream");
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="LANControl-Instalar.exe"',
        );
        res.setHeader("Content-Length", statSync(path).size + trailer.length);
        const stream = createReadStream(path);
        res.on("close", () => stream.destroy());
        stream.on("error", () => res.destroy());
        stream.on("end", () => res.end(trailer));
        stream.pipe(res, { end: false });
        return;
      }
      if (p === "/installer" && req.method === "GET")
        throw new HttpError(
          405,
          "Use o botão Baixar instalador na seção Instalação.",
        );
      throw new HttpError(404, "Rota inexistente");
    } catch (e: any) {
      const status =
        e instanceof HttpError ? e.status : e.name === "ZodError" ? 400 : 500;
      res.status(status).json({
        error:
          status === 500
            ? "Erro interno; consulte a auditoria/saúde do serviço"
            : e.name === "ZodError"
              ? "Dados inválidos"
              : e.message,
      });
    }
  });
  const web = next({
    dev: process.env.NODE_ENV !== "production",
    dir: resolve("apps/web"),
  });
  await web.prepare();
  app.use((req: Request, res: Response) => web.getRequestHandler()(req, res));
  const mobileRelay = attachMobileRelay(app.getHttpServer(), svc, origin);
  await app.listen(Number(process.env.PORT ?? 3000), "0.0.0.0");
  let working = false;
  const timer = setInterval(async () => {
    if (working) return;
    working = true;
    try {
      await svc.tick();
    } catch {
      console.error("Scheduler unavailable");
    } finally {
      working = false;
    }
  }, 15000);
  return {
    app,
    close: async () => {
      clearInterval(timer);
      mobileRelay.close();
      await app.close();
    },
  };
}
if (require.main === module) {
  connect()
    .then(async (db) => {
      const server = await start(db);
      process.on("SIGTERM", async () => {
        await server.close();
        await db.end();
        process.exit(0);
      });
    })
    .catch(() => {
      console.error(
        "Startup failed. Check required configuration and database availability.",
      );
      process.exit(1);
    });
}
