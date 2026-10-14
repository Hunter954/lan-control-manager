import { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { Service } from "./service";
const controlSchema = z.discriminatedUnion("action", [
  z.object({
    type: z.literal("control"),
    action: z.literal("tap"),
    x: z.number().min(0).max(1),
    duration: z.number().int().min(50).max(1500).default(60),
    y: z.number().min(0).max(1),
  }),
  z.object({
    type: z.literal("control"),
    action: z.literal("swipe"),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    endX: z.number().min(0).max(1),
    endY: z.number().min(0).max(1),
    duration: z.number().int().min(100).max(1500),
  }),
  z.object({
    type: z.literal("control"),
    action: z.enum([
      "back",
      "home",
      "recent",
      "stop",
      "screen",
      "front",
      "rear",
    ]),
  }),
  z.object({
    type: z.literal("control"),
    action: z.literal("text"),
    text: z.string().max(256),
  }),
]);
export function attachMobileRelay(
  server: Server,
  svc: Service,
  origin: string,
) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 512 * 1024,
    perMessageDeflate: false,
  });
  const phones = new Map<
      string,
      { socket: WebSocket; status: any; sources?: ("screen" | "camera")[] }
    >(),
    viewers = new Map<string, WebSocket>();
  const connections = new Set<WebSocket>();
  const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let shuttingDown = false;
  function cancelReconnect(id: string) {
    const timer = reconnectTimers.get(id);
    if (timer) clearTimeout(timer);
    reconnectTimers.delete(id);
  }
  function stopPhone(id: string, reason: string) {
    cancelReconnect(id);
    const phone = phones.get(id);
    if (phone?.socket.readyState === WebSocket.OPEN) {
      phone.status = { type: "status", mode: "stopped", control: false };
      phone.socket.send(JSON.stringify({ type: "control", action: "stop" }));
      phone.socket.close(1000, reason);
    }
  }

  server.on("upgrade", (req, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "", origin);
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== "/api/mobile/live") return;
    (async () => {
      const id = z.uuid().parse(url.searchParams.get("device"));
      const bearer = req.headers.authorization?.replace(/^Bearer /, "");
      const isPhone = !!bearer;
      let actor: string,
        session = "";
      if (isPhone) {
        const d = await svc.device(bearer!);
        if (d.id !== id || d.role !== "android") throw new Error();
        if (phones.has(id)) throw new Error();
        actor = "android";
      } else {
        if (req.headers.origin !== origin) throw new Error();
        session =
          req.headers.cookie
            ?.split(";")
            .map((s) => s.trim())
            .find((s) => s.startsWith("lan_session="))
            ?.slice(12) ?? "";
        actor = (await svc.admin(session)).username;
        const d = (
          await svc.db.query("SELECT role,revoked FROM devices WHERE id=$1", [
            id,
          ])
        ).rows[0];
        if (d?.role !== "android" || d.revoked) throw new Error();
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        if (isPhone && phones.has(id)) {
          ws.close(1008, "Sessão já conectada");
          return;
        }
        connections.add(ws);
        const send = (target: WebSocket | undefined, v: any) => {
          if (target?.readyState === WebSocket.OPEN)
            target.send(JSON.stringify(v));
        };
        if (isPhone) {
          phones.set(id, {
            socket: ws,
            status: { type: "status", mode: "waiting", control: false },
          });
          svc.audit(actor, "mobile.session.started", id).catch(() => {});
          send(viewers.get(id), {
            type: "status",
            mode: "waiting",
            control: false,
          });
        } else {
          cancelReconnect(id);
          const previous = viewers.get(id);
          viewers.set(id, ws);
          previous?.close(1008, "Visualização aberta em outra janela");
          send(
            ws,
            phones.get(id)?.status ?? {
              type: "status",
              mode: "offline",
              control: false,
            },
          );
          svc.audit(actor, "mobile.viewer.connected", id).catch(() => {});
        }
        let count = 0,
          last = Date.now(),
          busy = false;
        const timer = setInterval(async () => {
          if (busy) return;
          busy = true;
          try {
            if (isPhone) {
              await svc.device(bearer!);
              await svc.db.query(
                "UPDATE devices SET last_seen=now() WHERE id=$1",
                [id],
              );
            } else await svc.admin(session);
          } catch {
            if (!isPhone && viewers.get(id) === ws)
              stopPhone(id, "Autenticação encerrada");
            ws.close(1008, "Sessão encerrada");
          } finally {
            busy = false;
          }
        }, 10000);
        ws.on("message", async (data, binary) => {
          try {
            if (Date.now() - last > 1000) {
              count = 0;
              last = Date.now();
            }
            if (++count > (isPhone ? 12 : 20)) throw new Error("rate");
            if (isPhone && phones.get(id)?.socket !== ws) {
              ws.close();
              return;
            }
            if (isPhone && binary) {
              const v = viewers.get(id);
              if (
                v?.readyState === WebSocket.OPEN &&
                v.bufferedAmount < 1024 * 1024 &&
                ["screen", "camera"].includes(phones.get(id)?.status.mode)
              )
                v.send(data, { binary: true });
              return;
            }
            if (binary || Buffer.byteLength(data.toString()) > 8192)
              throw new Error();
            const msg = JSON.parse(data.toString());
            if (isPhone) {
              if (msg.type === "status") {
                const status = z
                  .object({
                    type: z.literal("status"),
                    mode: z.enum(["screen", "camera", "waiting", "stopped"]),
                    control: z.boolean(),
                    facing: z.enum(["front", "rear"]).optional(),
                    sources: z
                      .array(z.enum(["screen", "camera"]))
                      .min(1)
                      .max(2)
                      .refine(
                        (sources) => new Set(sources).size === sources.length,
                      )
                      .optional(),
                    width: z.number().int().positive().max(10000).optional(),
                    height: z.number().int().positive().max(10000).optional(),
                    message: z.string().max(200).optional(),
                  })
                  .refine(
                    (status) =>
                      !status.sources ||
                      !["screen", "camera"].includes(status.mode) ||
                      status.sources.includes(
                        status.mode as "screen" | "camera",
                      ),
                  )
                  .parse(msg);
                const phone = phones.get(id)!;
                if (status.sources) {
                  if (
                    phone.sources &&
                    (phone.sources.length !== status.sources.length ||
                      !status.sources.every((source) =>
                        phone.sources!.includes(source),
                      ))
                  )
                    throw new Error();
                  phone.sources ??= status.sources;
                }
                if (phone.sources) {
                  if (
                    ["screen", "camera"].includes(status.mode) &&
                    !phone.sources.includes(status.mode as "screen" | "camera")
                  )
                    throw new Error();
                  status.sources = phone.sources;
                }
                phone.status = status;
                send(viewers.get(id), status);
              }
              return;
            }
            await svc.admin(session);
            const activeDevice = (
              await svc.db.query("SELECT revoked FROM devices WHERE id=$1", [
                id,
              ])
            ).rows[0];
            if (!activeDevice || activeDevice.revoked) throw new Error();
            const command = controlSchema.parse(msg);
            const phone = phones.get(id);
            if (!phone) {
              send(ws, {
                type: "error",
                message: "Inicie o compartilhamento no tablet.",
              });
              return;
            }
            const active = ["screen", "camera"].includes(phone.status.mode);
            const sources =
              phone.status.sources ?? (active ? [phone.status.mode] : []);
            const allowed =
              command.action === "stop" ||
              (active &&
                (command.action === "screen"
                  ? sources.includes("screen")
                  : command.action === "front" || command.action === "rear"
                    ? sources.includes("camera")
                    : phone.status.mode === "screen" && phone.status.control));
            if (!allowed) {
              send(ws, {
                type: "error",
                message: "Recurso não autorizado no tablet para esta sessão.",
              });
              return;
            }
            if (viewers.get(id) !== ws) throw new Error();
            await svc.audit(actor, "mobile.control." + command.action, id);
            if (viewers.get(id) !== ws) throw new Error();
            if (command.action === "stop")
              stopPhone(id, "Encerrado pelo administrador");
            else send(phone.socket, command);
          } catch {
            send(ws, {
              type: "error",
              message: "Comando não permitido ou sessão inválida.",
            });
          }
        });
        ws.on("close", () => {
          clearInterval(timer);
          connections.delete(ws);
          if (isPhone && phones.get(id)?.socket === ws) {
            cancelReconnect(id);
            phones.delete(id);
            send(viewers.get(id), {
              type: "status",
              mode: "offline",
              control: false,
            });
            svc.audit(actor, "mobile.session.ended", id).catch(() => {});
          } else if (!isPhone && viewers.get(id) === ws) {
            viewers.delete(id);
            const phone = phones.get(id)?.socket;
            if (!shuttingDown && phone?.readyState === WebSocket.OPEN) {
              cancelReconnect(id);
              reconnectTimers.set(
                id,
                setTimeout(() => {
                  reconnectTimers.delete(id);
                  if (!viewers.has(id) && phones.get(id)?.socket === phone) {
                    stopPhone(id, "Painel não reconectou em 60 segundos");
                    svc
                      .audit(actor, "mobile.viewer.reconnect.expired", id)
                      .catch(() => {});
                  }
                }, 60000),
              );
            }
          }
        });
        ws.on("error", () => {});
      });
    })().catch(() => {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    });
  });
  return {
    stop: (id: string) => stopPhone(id, "Encerrado pelo administrador"),
    disconnect: (id: string) => {
      cancelReconnect(id);
      phones.get(id)?.socket.close(1008, "Acesso revogado");
      viewers.get(id)?.close(1008, "Acesso revogado");
    },
    close: () => {
      shuttingDown = true;
      for (const id of reconnectTimers.keys()) cancelReconnect(id);
      for (const c of connections) c.terminate();
      wss.close();
    },
  };
}
