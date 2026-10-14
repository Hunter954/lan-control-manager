import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DB } from "./db";
import {
  digest,
  token,
  equal,
  hashPassword,
  verifyPassword,
  encrypt,
  decrypt,
  newTotpSecret,
  totpStep,
} from "./security";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const str = z.string().min(1).max(160);
const kinds = z.enum([
  "inventory",
  "reboot",
  "shutdown",
  "lock",
  "unlock",
  "wol",
  "steam_update",
  "agent_update",
]);
export const payloadSchema = z
  .object({
    mac: z
      .string()
      .regex(/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/)
      .optional(),
    appId: z.number().int().positive().max(2147483647).optional(),
  })
  .strict();
export class Service {
  constructor(
    public db: DB,
    public key: string,
    public bootstrap: string,
  ) {}
  async audit(actor: string, action: string, target?: string) {
    await this.db.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,$2,$3)",
      [actor, action, target ?? null],
    );
  }
  async limit(key: string) {
    const r = await this.db.query(
      "INSERT INTO login_limits(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_limits.reset_at<now() THEN 1 ELSE login_limits.attempts+1 END,reset_at=CASE WHEN login_limits.reset_at<now() THEN now()+interval '15 minutes' ELSE login_limits.reset_at END RETURNING attempts",
      [key],
    );
    if (r.rows[0].attempts > 10)
      throw new HttpError(429, "Muitas tentativas. Aguarde 15 minutos.");
  }
  async setup(b: any, ip: string) {
    await this.limit("setup:" + ip);
    if (
      !this.bootstrap ||
      !equal(digest(b.token ?? ""), digest(this.bootstrap))
    )
      throw new HttpError(403, "Token de configuração inválido");
    if ((await this.db.query("SELECT id FROM admins")).rows.length)
      throw new HttpError(409, "Administrador já configurado");
    if (b.action === "secret") {
      const secret = newTotpSecret();
      return {
        secret,
        uri: `otpauth://totp/LANControl:admin?secret=${secret}&issuer=LANControl`,
      };
    }
    const v = z
      .object({
        username: str,
        password: z.string().min(14).max(128),
        secret: z.string().regex(/^[A-Z2-7]{32}$/),
        code: z.string().regex(/^\d{6}$/),
      })
      .parse(b);
    const step = totpStep(v.secret, v.code);
    if (step === null) throw new HttpError(401, "Código 2FA inválido");
    await this.db.query(
      "INSERT INTO admins(id,username,password_hash,totp_secret,last_totp_step) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        v.username,
        hashPassword(v.password),
        encrypt(v.secret, this.key),
        step,
      ],
    );
    await this.audit("setup", "admin.created");
    return { ok: true };
  }
  async login(b: any, ip: string) {
    await this.limit("login:" + ip);
    const v = z
      .object({
        username: str,
        password: z.string().max(128),
        code: z.string().regex(/^\d{6}$/),
      })
      .parse(b);
    const a = (
      await this.db.query("SELECT * FROM admins WHERE username=$1", [
        v.username,
      ])
    ).rows[0];
    if (!a || !verifyPassword(v.password, a.password_hash))
      throw new HttpError(401, "Credenciais inválidas");
    const step = totpStep(
      decrypt(a.totp_secret, this.key),
      v.code,
      Number(a.last_totp_step),
    );
    if (step === null)
      throw new HttpError(401, "Código inválido ou já utilizado");
    const updated = await this.db.query(
      "UPDATE admins SET last_totp_step=$1 WHERE id=$2 AND last_totp_step<$1 RETURNING id",
      [step, a.id],
    );
    if (!updated.rows.length) throw new HttpError(401, "Código já utilizado");
    const t = token();
    await this.db.query(
      "INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
      [digest(t), a.id],
    );
    await this.audit(a.username, "auth.login");
    return t;
  }
  async admin(t: string) {
    const a = (
      await this.db.query(
        "SELECT a.id,a.username FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>now()",
        [digest(t)],
      )
    ).rows[0];
    if (!a) throw new HttpError(401, "Entre novamente");
    return a;
  }
  async device(t: string) {
    const d = (
      await this.db.query(
        "SELECT * FROM devices WHERE token_hash=$1 AND NOT revoked",
        [digest(t)],
      )
    ).rows[0];
    if (!d) throw new HttpError(401, "Agente não autorizado");
    return d;
  }
  async enroll(b: any, ip: string) {
    await this.limit("enroll:" + ip);
    const identity = z
      .object({
        token: z.string().length(64),
        hostname: str.optional(),
        mac: z
          .string()
          .regex(/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/)
          .nullish(),
      })
      .parse(b);
    const t = token();
    const d = (
      await this.db.query(
        "UPDATE devices SET token_hash=$1,enrollment_hash=NULL,enrollment_expires=NULL,name=CASE WHEN auto_name AND $3::text IS NOT NULL THEN $3 ELSE name END,name_source=CASE WHEN auto_name AND $3::text IS NOT NULL THEN 'windows' ELSE name_source END,mac=COALESCE($4,mac) WHERE enrollment_hash=$2 AND enrollment_expires>now() AND NOT revoked RETURNING id,role,name",
        [
          digest(t),
          digest(identity.token),
          identity.hostname ?? null,
          identity.mac ?? null,
        ],
      )
    ).rows[0];
    if (!d) throw new HttpError(401, "Convite inválido ou expirado");
    await this.audit("agent", "device.enrolled", d.id);
    return { ...d, token: t };
  }
  async createDevice(b: any, actor: string) {
    const v = z
      .object({
        name: str.optional(),
        role: z.enum(["station", "gateway"]).default("station"),
      })
      .parse(b);
    const t = token(),
      id = randomUUID();
    await this.db.query(
      "INSERT INTO devices(id,name,role,enrollment_hash,enrollment_expires,auto_name,name_source) VALUES($1,$2,$3,$4,now()+interval '48 hours',$5,$6)",
      [
        id,
        v.name ?? "Aguardando instalação",
        v.role,
        digest(t),
        !v.name,
        v.name ? "manual" : "pending",
      ],
    );
    await this.audit(actor, "device.invited", id);
    return {
      id,
      token: t,
      expiresInHours: 48,
      expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(),
    };
  }
  async command(b: any, actor: string, source = "admin") {
    const v = z
      .object({
        deviceId: z.uuid(),
        kind: kinds,
        payload: payloadSchema.default({}),
      })
      .parse(b);
    const d = (
      await this.db.query("SELECT * FROM devices WHERE id=$1 AND NOT revoked", [
        v.deviceId,
      ])
    ).rows[0];
    if (!d) throw new HttpError(404, "Estação não encontrada");
    if (!d.capabilities.includes(v.kind))
      throw new HttpError(409, "Operação não habilitada/validada neste agente");
    if (v.kind === "wol" && (d.role !== "gateway" || !v.payload.mac))
      throw new HttpError(400, "Wake-on-LAN requer gateway e MAC");
    if (v.kind === "steam_update" && !v.payload.appId)
      throw new HttpError(400, "App ID obrigatório");
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO commands(id,device_id,kind,payload,expires_at,source) VALUES($1,$2,$3,$4,now()+CASE WHEN $3 IN ('steam_update','agent_update') THEN interval '2 hours' ELSE interval '5 minutes' END,$5)",
      [id, v.deviceId, v.kind, JSON.stringify(v.payload), source],
    );
    await this.audit(actor, "command." + v.kind, v.deviceId);
    return { id, status: "queued" };
  }
  async heartbeat(d: any, b: any) {
    const v = z
      .object({
        telemetry: z
          .object({
            hostname: str,
            version: str,
            os: str,
            freeDiskBytes: z.number().nonnegative().optional(),
            uptimeSeconds: z.number().nonnegative().optional(),
            lockState: z
              .enum(["unknown", "locked", "unlocked"])
              .default("unknown"),
            handyCafeInstalled: z.boolean().optional(),
            handyCafeVersion: z.string().max(160).optional(),
            deepFreezeState: z
              .enum(["unknown", "frozen", "thawed", "unprotected"])
              .default("unknown"),
          })
          .strict(),
        capabilities: z.array(kinds).max(8),
      })
      .parse(b);
    if (d.role === "station" && v.capabilities.includes("wol"))
      throw new HttpError(400, "WOL apenas no gateway");
    await this.db.query(
      "UPDATE devices SET last_seen=now(),telemetry=$1,capabilities=$2 WHERE id=$3",
      [JSON.stringify(v.telemetry), JSON.stringify(v.capabilities), d.id],
    );
    return { ok: true };
  }
  async poll(d: any) {
    const lease = token();
    const r = await this.db.query(
      "UPDATE commands SET status='leased',leased_at=now(),lease_hash=$1 WHERE id=(SELECT id FROM commands WHERE device_id=$2 AND status='queued' AND expires_at>now() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id,kind,payload,expires_at",
      [digest(lease), d.id],
    );
    return r.rows[0] ? { ...r.rows[0], lease } : null;
  }
  async ack(d: any, b: any) {
    const v = z
      .object({ id: z.uuid(), lease: z.string().length(64), ok: z.boolean() })
      .parse(b);
    const r = await this.db.query(
      "UPDATE commands SET status=$1,result=CASE WHEN $1='failed' THEN $2 WHEN kind='agent_update' THEN 'Tarefa de atualização solicitada; confira a nova versão na telemetria' WHEN kind IN ('reboot','shutdown') THEN 'Operação agendada no Windows para 30 segundos; confira novo estado por heartbeat' WHEN kind='wol' THEN 'Magic packet enviado; confira heartbeat da estação de destino' ELSE $2 END,completed_at=now(),lease_hash=NULL WHERE id=$3 AND device_id=$4 AND status='leased' AND lease_hash=$5 AND expires_at>now() RETURNING id",
      [
        v.ok ? "succeeded" : "failed",
        v.ok
          ? "Operação concluída"
          : "Falha no agente; consulte o log local sem credenciais",
        v.id,
        d.id,
        digest(v.lease),
      ],
    );
    if (!r.rows.length)
      throw new HttpError(409, "Comando expirado ou confirmação inválida");
    await this.audit(
      "agent",
      "command." + (v.ok ? "succeeded" : "failed"),
      v.id,
    );
    return { ok: true };
  }
  async overview() {
    return {
      devices: (
        await this.db.query(
          "SELECT id,name,name_source,mac,role,last_seen,telemetry,capabilities,revoked,enrollment_expires FROM devices ORDER BY name",
        )
      ).rows,
      commands: (
        await this.db.query(
          "SELECT id,device_id,kind,status,created_at,completed_at,result,source FROM commands ORDER BY created_at DESC LIMIT 100",
        )
      ).rows,
      schedules: (await this.db.query("SELECT * FROM schedules ORDER BY name"))
        .rows,
      credentials: (
        await this.db.query("SELECT integration,updated_at FROM credentials")
      ).rows,
      audit: (
        await this.db.query("SELECT * FROM audit ORDER BY id DESC LIMIT 100")
      ).rows,
    };
  }
  async credential(b: any, actor: string) {
    const v = z
      .object({
        integration: z.enum(["deepfreeze", "handycafe", "steam"]),
        username: z.string().max(160),
        password: z.string().min(1).max(512),
      })
      .parse(b);
    await this.db.query(
      "INSERT INTO credentials(integration,encrypted) VALUES($1,$2) ON CONFLICT(integration) DO UPDATE SET encrypted=$2,updated_at=now()",
      [
        v.integration,
        encrypt(
          JSON.stringify({ username: v.username, password: v.password }),
          this.key,
        ),
      ],
    );
    await this.audit(actor, "credential.updated", v.integration);
    return { ok: true };
  }
  async schedule(b: any, actor: string) {
    const v = z
      .object({
        deviceId: z.uuid(),
        name: str,
        appId: z.number().int().positive(),
        weekday: z.number().int().min(0).max(6).default(2),
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59),
      })
      .parse(b);
    const d = (
      await this.db.query(
        "SELECT capabilities FROM devices WHERE id=$1 AND NOT revoked",
        [v.deviceId],
      )
    ).rows[0];
    if (!d?.capabilities.includes("steam_update"))
      throw new HttpError(409, "Atualização ainda não habilitada no agente");
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO schedules(id,device_id,name,kind,payload,weekday,hour,minute) VALUES($1,$2,$3,'steam_update',$4,$5,$6,$7)",
      [
        id,
        v.deviceId,
        v.name,
        JSON.stringify({ appId: v.appId }),
        v.weekday,
        v.hour,
        v.minute,
      ],
    );
    await this.audit(actor, "schedule.created", id);
    return { id };
  }
  async tick(now = new Date()) {
    await this.db.query(
      "UPDATE commands SET status='expired',lease_hash=NULL,result='Prazo expirado; execução não confirmada' WHERE status IN ('queued','leased') AND expires_at<now()",
    );
    await this.db.query("DELETE FROM sessions WHERE expires_at<now()");
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const p = Object.fromEntries(f.map((x) => [x.type, x.value]));
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
        p.weekday,
      ),
      slot = `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
    const rows = (
      await this.db.query(
        "SELECT * FROM schedules WHERE enabled AND weekday=$1 AND hour=$2 AND minute=$3",
        [day, +p.hour, +p.minute],
      )
    ).rows;
    for (const s of rows) {
      const claimed = await this.db.query(
        "UPDATE schedules SET last_slot=$1 WHERE id=$2 AND (last_slot IS NULL OR last_slot<>$1) RETURNING id",
        [slot, s.id],
      );
      if (claimed.rows.length) {
        try {
          await this.command(
            { deviceId: s.device_id, kind: s.kind, payload: s.payload },
            "scheduler",
            "schedule",
          );
        } catch {
          await this.audit("scheduler", "schedule.blocked", s.id);
        }
      }
    }
  }
}
