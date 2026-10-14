"use client";
import { useEffect, useState, FormEvent } from "react";
type Device = {
  id: string;
  name: string;
  role: string;
  last_seen: string | null;
  revoked: boolean;
  capabilities: string[];
  telemetry: any;
};
const labels: Record<string, string> = {
  inventory: "Atualizar inventário",
  reboot: "Reiniciar",
  shutdown: "Desligar",
  lock: "Bloquear",
  unlock: "Desbloquear",
  wol: "Ligar por WOL",
  steam_update: "Atualizar jogo",
  agent_update: "Atualizar agente",
};
export default function Page() {
  const [user, setUser] = useState<any>(null),
    [tab, setTab] = useState("stations"),
    [data, setData] = useState<any>({
      devices: [],
      commands: [],
      schedules: [],
      audit: [],
      credentials: [],
    }),
    [message, setMessage] = useState(""),
    [invite, setInvite] = useState<any>(null),
    [setup, setSetup] = useState(false),
    [secret, setSecret] = useState(""),
    [busy, setBusy] = useState(false);
  async function api(path: string, body?: any) {
    const r = await fetch("/api" + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    return v;
  }
  async function reload() {
    setData(await api("/overview"));
  }
  useEffect(() => {
    api("/me")
      .then((u) => {
        setUser(u);
        reload();
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!user) return;
    const t = setInterval(
      () =>
        reload().catch(() =>
          setMessage("Conexão indisponível; exibindo últimos dados"),
        ),
      15000,
    );
    return () => clearInterval(t);
  }, [user]);
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  const values = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    return Object.fromEntries(new FormData(e.currentTarget));
  };
  if (!user)
    return (
      <main className="login">
        <div className="brand">
          LC<span>LAN CONTROL</span>
        </div>
        <div className="loginbox">
          <p className="eyebrow">CENTRAL DE OPERAÇÕES</p>
          <h1>{setup ? "Configuração inicial" : "Sua LAN, sob controle."}</h1>
          <p className="muted">
            Acesso administrativo com autenticação em duas etapas.
          </p>
          <form
            onSubmit={(e) => {
              const b = values(e);
              run(async () => {
                if (setup) {
                  if (!secret) {
                    const v = await api("/auth/setup", {
                      token: b.token,
                      action: "secret",
                    });
                    setSecret(v.secret);
                    return;
                  }
                  await api("/auth/setup", { ...b, secret });
                  setSetup(false);
                  setSecret("");
                  setMessage(
                    "Administrador criado. Aguarde o próximo código 2FA para entrar.",
                  );
                } else {
                  await api("/auth/login", b);
                  setUser(await api("/me"));
                  await reload();
                }
              });
            }}
          >
            {setup && (
              <label>
                Token de configuração
                <input
                  name="token"
                  type="password"
                  autoComplete="off"
                  required
                />
              </label>
            )}
            {(!setup || secret) && (
              <>
                <label>
                  Usuário
                  <input name="username" autoComplete="username" required />
                </label>
                <label>
                  Senha
                  <input
                    name="password"
                    type="password"
                    autoComplete={setup ? "new-password" : "current-password"}
                    minLength={setup ? 14 : 1}
                    required
                  />
                </label>
                {secret && (
                  <div className="notice">
                    Adicione esta chave ao seu aplicativo autenticador:
                    <code>{secret}</code>Ela será exigida em todos os acessos.
                  </div>
                )}
                <label>
                  Código do autenticador
                  <input
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                  />
                </label>
              </>
            )}
            <button disabled={busy}>
              {busy
                ? "Aguarde…"
                : setup && !secret
                  ? "Preparar 2FA"
                  : setup
                    ? "Criar administrador"
                    : "Entrar no painel"}
            </button>
          </form>
          <button
            className="link"
            onClick={() => {
              setSetup(!setup);
              setSecret("");
              setMessage("");
            }}
          >
            {setup ? "Voltar ao login" : "Primeiro acesso"}
          </button>
          {message && (
            <p role="alert" className="notice">
              {message}
            </p>
          )}
        </div>
        <p className="muted">LAN Control Manager · acesso protegido</p>
      </main>
    );
  const online = (d: Device) =>
    !d.revoked && d.last_seen && Date.now() - Date.parse(d.last_seen) < 60000;
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          LC
          <span>
            LAN CONTROL
            <br />
            <small>MANAGER</small>
          </span>
        </div>
        <p className="eyebrow">OPERAÇÃO</p>
        {[
          ["stations", "Estações"],
          ["commands", "Comandos"],
          ["schedules", "Agendamentos"],
          ["integrations", "Integrações"],
          ["audit", "Auditoria"],
          ["install", "Instalação"],
        ].map(([id, l]) => (
          <button
            key={id}
            className={"nav " + (tab === id ? "selected" : "")}
            onClick={() => setTab(id)}
          >
            {l}
          </button>
        ))}
        <div className="user">
          {user.username}
          <button
            className="link"
            onClick={() =>
              run(async () => {
                await api("/auth/logout", {});
                setUser(null);
              })
            }
          >
            Sair
          </button>
        </div>
      </aside>
      <main className="content">
        <header>
          <div>
            <p className="eyebrow">PAINEL ADMINISTRATIVO</p>
            <h1>
              {
                {
                  stations: "Visão das estações",
                  commands: "Fila de comandos",
                  schedules: "Manutenção programada",
                  integrations: "Credenciais e integrações",
                  audit: "Histórico de auditoria",
                  install: "Instalar e conectar",
                }[tab]
              }
            </h1>
          </div>
          <span className="pill">Atualização a cada 15s</span>
        </header>
        {message && (
          <div role="alert" className="notice">
            {message}
          </div>
        )}
        <div className="stats">
          <div>
            <span>Estações</span>
            <strong>
              {data.devices.filter((d: Device) => d.role === "station").length}
            </strong>
          </div>
          <div>
            <span>Online</span>
            <strong>{data.devices.filter(online).length}</strong>
          </div>
          <div>
            <span>Comandos pendentes</span>
            <strong>
              {
                data.commands.filter((c: any) =>
                  ["queued", "leased"].includes(c.status),
                ).length
              }
            </strong>
          </div>
          <div>
            <span>Agendamentos ativos</span>
            <strong>
              {data.schedules.filter((s: any) => s.enabled).length}
            </strong>
          </div>
        </div>
        {tab === "stations" && (
          <>
            <div className="sectionhead">
              <h2>Computadores e gateways</h2>
              <button className="secondary" onClick={() => setTab("install")}>
                + Conectar computador
              </button>
            </div>
            {!data.devices.length && (
              <div className="empty">
                <h2>Sua primeira estação começa aqui</h2>
                <p>
                  Crie um convite e instale o agente uma vez em cada PC. Para
                  ligar PCs desligados, instale também um gateway sempre ligado
                  na rede local.
                </p>
                <button onClick={() => setTab("install")}>
                  Preparar instalação
                </button>
              </div>
            )}
            <div className="cards">
              {data.devices.map((d: Device) => (
                <article key={d.id}>
                  <div className="stationtop">
                    <div className="pc">
                      {d.role === "gateway" ? "GW" : "PC"}
                    </div>
                    <span className={"pill " + (online(d) ? "green" : "")}>
                      {d.revoked
                        ? "Revogado"
                        : online(d)
                          ? "Online"
                          : "Offline"}
                    </span>
                  </div>
                  <h2>{d.name}</h2>
                  <p className="muted">
                    {d.role === "gateway"
                      ? "Gateway local"
                      : (d.telemetry.os ?? "Aguardando instalação")}{" "}
                    · {d.telemetry.version ?? "—"}
                  </p>
                  <dl>
                    <dt>Bloqueio</dt>
                    <dd>{d.telemetry.lockState ?? "unknown"}</dd>
                    <dt>Deep Freeze</dt>
                    <dd>{d.telemetry.deepFreezeState ?? "unknown"}</dd>
                    <dt>Último contato</dt>
                    <dd>
                      {d.last_seen
                        ? new Date(d.last_seen).toLocaleString("pt-BR")
                        : "Nenhum"}
                    </dd>
                  </dl>
                  <div className="actions">
                    {Object.entries(labels).map(([kind, label]) => (
                      <button
                        key={kind}
                        className="secondary"
                        disabled={
                          busy ||
                          !d.capabilities.includes(kind) ||
                          d.revoked ||
                          !online(d)
                        }
                        title={
                          !d.capabilities.includes(kind)
                            ? "Integração pendente de validação"
                            : label
                        }
                        onClick={() =>
                          run(async () => {
                            const payload: any = {};
                            if (kind === "wol") {
                              const mac = prompt(
                                "MAC do PC na mesma rede (AA:BB:CC:DD:EE:FF)",
                              );
                              if (!mac) return;
                              payload.mac = mac;
                            }
                            if (kind === "steam_update") {
                              const id = prompt(
                                "Steam App ID autorizado neste agente",
                              );
                              if (!id) return;
                              payload.appId = Number(id);
                            }
                            if (
                              ["reboot", "shutdown"].includes(kind) &&
                              !confirm(`${label} ${d.name}?`)
                            )
                              return;
                            await api("/commands", {
                              deviceId: d.id,
                              kind,
                              payload,
                            });
                            await reload();
                            setMessage(
                              "Comando enfileirado. Acompanhe a confirmação em Comandos.",
                            );
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    className="link danger"
                    onClick={() =>
                      run(async () => {
                        if (
                          !confirm(
                            "Revogar permanentemente o acesso deste agente?",
                          )
                        )
                          return;
                        await api("/device/revoke", { id: d.id });
                        await reload();
                      })
                    }
                  >
                    Revogar acesso
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
        {tab === "commands" && (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Estação</th>
                  <th>Operação</th>
                  <th>Estado</th>
                  <th>Horário</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {data.commands.map((c: any) => (
                  <tr key={c.id}>
                    <td>
                      {
                        data.devices.find((d: Device) => d.id === c.device_id)
                          ?.name
                      }
                    </td>
                    <td>{labels[c.kind]}</td>
                    <td>
                      <span className="pill">{c.status}</span>
                    </td>
                    <td>{new Date(c.created_at).toLocaleString("pt-BR")}</td>
                    <td>{c.result ?? "Aguardando confirmação"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === "schedules" && (
          <>
            <div className="notice">
              Horários em Brasília. Terça-feira é o padrão. Só agentes
              habilitados para SteamCMD aceitam agendamento; PCs offline ou
              protegidos não têm manutenção confirmada.
            </div>
            <form
              className="panel gridform"
              onSubmit={(e) => {
                const b = values(e);
                run(async () => {
                  await api("/schedules", {
                    ...b,
                    appId: Number(b.appId),
                    weekday: Number(b.weekday),
                    hour: Number(b.hour),
                    minute: Number(b.minute),
                  });
                  await reload();
                  setMessage("Agendamento criado");
                });
              }}
            >
              <label>
                Nome
                <input name="name" required />
              </label>
              <label>
                Estação
                <select name="deviceId" required>
                  {data.devices
                    .filter(
                      (d: Device) =>
                        d.capabilities.includes("steam_update") && !d.revoked,
                    )
                    .map((d: Device) => (
                      <option value={d.id} key={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                App ID
                <input name="appId" type="number" min="1" required />
              </label>
              <label>
                Dia
                <select name="weekday" defaultValue="2">
                  {[
                    "Domingo",
                    "Segunda",
                    "Terça",
                    "Quarta",
                    "Quinta",
                    "Sexta",
                    "Sábado",
                  ].map((l, i) => (
                    <option value={i} key={i}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Hora
                <input
                  name="hour"
                  type="number"
                  min="0"
                  max="23"
                  defaultValue="4"
                  required
                />
              </label>
              <label>
                Minuto
                <input
                  name="minute"
                  type="number"
                  min="0"
                  max="59"
                  defaultValue="0"
                  required
                />
              </label>
              <button disabled={busy}>Adicionar agendamento</button>
            </form>
            {data.schedules.map((s: any) => (
              <div className="panel sectionhead" key={s.id}>
                <span>
                  {s.name} · {s.hour}:{String(s.minute).padStart(2, "0")} ·{" "}
                  {s.enabled ? "Ativo" : "Pausado"}
                </span>
                <button
                  className="secondary"
                  onClick={() =>
                    run(async () => {
                      await api("/schedule/toggle", { id: s.id });
                      await reload();
                    })
                  }
                >
                  {s.enabled ? "Pausar" : "Ativar"}
                </button>
              </div>
            ))}
          </>
        )}
        {tab === "integrations" && (
          <>
            <div className="notice">
              As credenciais ficam criptografadas e não são devolvidas ao
              navegador ou agente. Os adaptadores autenticados ainda dependem de
              validação local. O login Steam e o Steam Guard permanecem no fluxo
              oficial.
            </div>
            <div className="cards">
              {["deepfreeze", "handycafe", "steam"].map((integration) => (
                <form
                  className="panel"
                  key={integration}
                  onSubmit={(e) => {
                    const b = values(e),
                      form = e.currentTarget;
                    run(async () => {
                      await api("/credentials", { ...b, integration });
                      form.reset();
                      await reload();
                      setMessage("Credencial protegida salva");
                    });
                  }}
                >
                  <h2>
                    {
                      {
                        deepfreeze: "Deep Freeze",
                        handycafe: "HandyCafe",
                        steam: "Steam",
                      }[integration]
                    }
                  </h2>
                  <span className="pill">Validação local pendente</span>
                  <p className="muted">
                    {data.credentials.some(
                      (c: any) => c.integration === integration,
                    )
                      ? "Credencial cadastrada"
                      : "Credencial não cadastrada"}
                  </p>
                  <label>
                    Usuário
                    <input name="username" autoComplete="off" />
                  </label>
                  <label>
                    Senha
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                    />
                  </label>
                  <button disabled={busy}>Salvar com proteção</button>
                </form>
              ))}
            </div>
          </>
        )}
        {tab === "audit" && (
          <>
            <a className="download" href="/api/reports">
              Exportar relatório CSV
            </a>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Horário</th>
                    <th>Autor</th>
                    <th>Ação</th>
                    <th>Referência</th>
                  </tr>
                </thead>
                <tbody>
                  {data.audit.map((a: any) => (
                    <tr key={a.id}>
                      <td>{new Date(a.created_at).toLocaleString("pt-BR")}</td>
                      <td>{a.actor}</td>
                      <td>{a.action}</td>
                      <td>{a.target ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === "install" && (
          <>
            <div className="cards">
              <form
                className="panel"
                onSubmit={(e) => {
                  const b = values(e);
                  run(async () => {
                    setInvite(await api("/devices", b));
                    await reload();
                  });
                }}
              >
                <h2>1. Criar convite</h2>
                <label>
                  Nome
                  <input name="name" placeholder="PC-01" required />
                </label>
                <label>
                  Tipo
                  <select name="role">
                    <option value="station">Estação Windows</option>
                    <option value="gateway">Gateway local Windows</option>
                  </select>
                </label>
                <button disabled={busy}>Gerar convite único</button>
              </form>
              <div className="panel">
                <h2>2. Instalar no Windows</h2>
                <p>
                  Baixe o pacote, extraia e execute Install.ps1 como
                  administrador. Informe o endereço deste painel e o convite. O
                  serviço inicia automaticamente.
                </p>
                <button
                  onClick={() =>
                    run(async () => {
                      const r = await fetch("/api/installer");
                      if (!r.ok) throw new Error((await r.json()).error);
                      const u = URL.createObjectURL(await r.blob());
                      const a = document.createElement("a");
                      a.href = u;
                      a.download = "LANControl-Setup.zip";
                      a.click();
                      URL.revokeObjectURL(u);
                    })
                  }
                >
                  Baixar instalador
                </button>
                <p className="muted">
                  O pacote precisa ser compilado, validado e publicado pelo
                  administrador do servidor.
                </p>
              </div>
            </div>
            {invite && (
              <div className="notice">
                <strong>Convite: {invite.id}</strong>
                <code>{invite.token}</code>Uso único · expira em 30 minutos.
                Copie agora.
              </div>
            )}
            <div className="panel">
              <h2>Antes de instalar</h2>
              <p>
                Instale com autorização em uma janela de manutenção
                descongelada. Reserve uma área persistente para agente e dados.
                O gateway precisa permanecer ligado, e Wake-on-LAN deve estar
                habilitado no hardware e na rede.
              </p>
              <p>
                Bloqueio, desbloqueio, Deep Freeze e HandyCafe exigem validação
                das interfaces oficiais. Nenhum botão desabilitado indica
                operação concluída.
              </p>
            </div>
          </>
        )}
        <footer>
          LAN Control Manager · comandos auditados · Brasília (UTC−3)
        </footer>
      </main>
    </div>
  );
}
