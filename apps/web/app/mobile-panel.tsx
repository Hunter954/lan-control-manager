"use client";
import { useEffect, useRef, useState } from "react";
export default function MobilePanel({
  devices,
  reload,
}: {
  devices: any[];
  reload: () => Promise<any>;
}) {
  const [selected, setSelected] = useState(""),
    [status, setStatus] = useState<any>({ mode: "offline", control: false }),
    [frame, setFrame] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [text, setText] = useState("");
  const connection = useRef<WebSocket | null>(null),
    imageUrl = useRef(""),
    gesture = useRef<{ x: number; y: number; time: number } | null>(null);
  function selectDevice(id: string) {
    try {
      if (id) sessionStorage.setItem("lan-mobile-device", id);
      else sessionStorage.removeItem("lan-mobile-device");
    } catch {}
    setSelected(id);
  }
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("lan-mobile-device");
      if (saved && /^[0-9a-f-]{36}$/i.test(saved)) setSelected(saved);
    } catch {}
  }, []);
  useEffect(() => {
    let active = true,
      retryTimer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined,
      deadline = 0;
    function clearFrame() {
      if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
      imageUrl.current = "";
      setFrame("");
    }
    clearFrame();
    setError("");
    setStatus({ mode: "offline", control: false });
    if (!selected) return;
    function connect() {
      if (!active) return;
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/mobile/live?device=${selected}`,
      );
      socket = ws;
      connection.current = ws;
      ws.binaryType = "blob";
      let sourceKey = "";
      ws.onopen = () => {
        if (!active) {
          ws.close();
          return;
        }
        deadline = 0;
        setError("");
      };
      ws.onmessage = (e) => {
        if (!active || socket !== ws) return;
        if (e.data instanceof Blob) {
          const next = URL.createObjectURL(
            new Blob([e.data], { type: "image/jpeg" }),
          );
          if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
          imageUrl.current = next;
          setFrame(next);
        } else {
          try {
            const data = JSON.parse(e.data);
            if (data.type === "status") {
              setStatus(data);
              const nextSource =
                data.mode + (data.mode === "camera" ? ":" + data.facing : "");
              if (
                sourceKey !== nextSource ||
                ["offline", "stopped", "waiting"].includes(data.mode)
              )
                clearFrame();
              sourceKey = nextSource;
            }
            if (data.type === "error") setError(data.message);
          } catch {}
        }
      };
      ws.onclose = (event) => {
        if (!active || socket !== ws) return;
        connection.current = null;
        clearFrame();
        setStatus({ mode: "offline", control: false });
        if (event.code === 1008) {
          setError(
            event.reason === "Visualização aberta em outra janela"
              ? "Outro painel assumiu a visualização deste dispositivo."
              : "Acesso encerrado. Verifique o login e se o dispositivo foi revogado.",
          );
          return;
        }
        deadline ||= Date.now() + 45000;
        if (Date.now() < deadline) {
          setError("Reconectando ao mesmo compartilhamento…");
          retryTimer = setTimeout(connect, 1500);
        } else
          setError(
            "Não foi possível reconectar. Verifique a conexão e inicie nova sessão no tablet.",
          );
      };
      ws.onerror = () => {}; // onclose handles transport failures and bounded retries.
    }
    connect();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
      connection.current = null;
      if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
      imageUrl.current = "";
    };
  }, [selected]);
  function control(action: string, extra: any = {}) {
    if (connection.current?.readyState !== WebSocket.OPEN) {
      setError("Selecione o dispositivo e inicie uma sessão no tablet.");
      return;
    }
    connection.current.send(
      JSON.stringify({ type: "control", action, ...extra }),
    );
  }
  function point(e: React.PointerEvent<HTMLImageElement>) {
    const bounds = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height)),
    };
  }
  async function download() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/mobile/apk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok) throw new Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "LANControl-Android.apk";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const active = ["screen", "camera"].includes(status.mode);
  const sources = status.sources ?? (active ? [status.mode] : []);
  return (
    <>
      <div className="cards">
        <div className="panel">
          <h2>Conectar celular ou tablet Android</h2>
          <p>
            Baixe o APK personalizado e envie para um dispositivo autorizado.
            Abra e instale no Android; o convite e endereço já vêm embutidos.
            Cada download conecta um dispositivo dentro de 48 horas.
          </p>
          <button disabled={busy} onClick={download}>
            {busy
              ? "Preparando e assinando APK…"
              : "Baixar APK para celular/tablet"}
          </button>
          <p className="muted">
            Versão 0.2.3 · Android 8 ou superior. Visualização de tela e
            câmeras, sem acessibilidade ou toques remotos. O app solicita
            permissões no tablet e permite encerrar a qualquer momento.
          </p>
        </div>
        <div className="panel">
          <h2>Iniciar a sessão</h2>
          <p>
            No tablet, escolha Tela e câmeras e toque Iniciar sessão. As
            permissões necessárias são solicitadas em sequência. A captura de
            tela exige autorização do Android em cada sessão. Não há limite fixo
            de duração nem gravação. Durante essa sessão, alterne Tela, Câmera
            frontal ou Câmera traseira aqui no painel.
          </p>
          <p className="muted">
            Se o Play Protect bloquear a instalação, não desative a proteção.
            Registre o aviso para revisão do APK. A alternância exige autorizar
            Tela e câmeras no app. Modos Somente tela e Câmera permitem apenas o
            recurso escolhido. Telas protegidas e permissões exigem ação local.
            Recarregar o painel reconecta ao mesmo compartilhamento. Se o painel
            não voltar em até 60 segundos, a sessão é encerrada. Use Encerrar
            sessão para parar imediatamente.
          </p>
        </div>
      </div>
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      <div className="panel">
        <label>
          Dispositivo
          <select
            value={selected}
            onChange={(e) => selectDevice(e.target.value)}
          >
            <option value="">Selecione um dispositivo</option>
            {devices
              .filter((d) => !d.revoked)
              .map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </label>
        <button
          className="link danger"
          disabled={!selected || busy}
          onClick={async () => {
            if (!confirm("Revogar o acesso deste Android e encerrar a sessão?"))
              return;
            setBusy(true);
            try {
              const r = await fetch("/api/device/revoke", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: selected }),
              });
              if (!r.ok) throw new Error((await r.json()).error);
              selectDevice("");
              await reload();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Revogar dispositivo
        </button>
        <div className="sectionhead">
          <span className="pill">
            {status.mode === "screen"
              ? "Tela ao vivo"
              : status.mode === "camera"
                ? "Câmera " +
                  (status.facing === "front" ? "frontal" : "traseira")
                : "Sem sessão ativa"}{" "}
            · controle {status.control ? "permitido" : "desativado"}
          </span>
          <button
            className="secondary"
            disabled={!selected || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await fetch("/api/mobile/stop", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: selected }),
                });
                if (!r.ok) throw new Error((await r.json()).error);
                selectDevice("");
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Encerrar sessão
          </button>
        </div>
        {status.message && <p className="muted">{status.message}</p>}
        <div className="mobile-view">
          {frame ? (
            <img
              src={frame}
              alt="Compartilhamento autorizado do Android"
              draggable={false}
              style={{
                touchAction: status.control ? "none" : "auto",
                cursor: status.control ? "crosshair" : "default",
              }}
              onPointerDown={(e) => {
                if (!status.control || status.mode !== "screen") return;
                e.currentTarget.setPointerCapture(e.pointerId);
                gesture.current = { ...point(e), time: Date.now() };
              }}
              onPointerUp={(e) => {
                const start = gesture.current;
                gesture.current = null;
                if (!start || !status.control) return;
                const end = point(e);
                if (Math.hypot(end.x - start.x, end.y - start.y) > 0.015)
                  control("swipe", {
                    x: start.x,
                    y: start.y,
                    endX: end.x,
                    endY: end.y,
                    duration: Math.max(
                      100,
                      Math.min(1500, Date.now() - start.time),
                    ),
                  });
                else
                  control("tap", {
                    x: end.x,
                    y: end.y,
                    duration: Math.max(
                      50,
                      Math.min(1500, Date.now() - start.time),
                    ),
                  });
              }}
            />
          ) : (
            <p className="muted">
              Aguardando compartilhamento iniciado no dispositivo.
            </p>
          )}
        </div>
        <div className="actions">
          {status.control &&
            [
              ["back", "Voltar"],
              ["home", "Início"],
              ["recent", "Aplicativos"],
            ].map(([action, label]) => (
              <button
                className="secondary"
                key={action}
                disabled={!status.control || status.mode !== "screen"}
                onClick={() => control(action)}
              >
                {label}
              </button>
            ))}
          <button
            className="secondary"
            disabled={
              !active || !sources.includes("screen") || status.mode === "screen"
            }
            onClick={() => control("screen")}
          >
            Tela
          </button>
          <button
            className="secondary"
            disabled={
              !active ||
              !sources.includes("camera") ||
              (status.mode === "camera" && status.facing === "front")
            }
            onClick={() => control("front")}
          >
            Câmera frontal
          </button>
          <button
            className="secondary"
            disabled={
              !active ||
              !sources.includes("camera") ||
              (status.mode === "camera" && status.facing === "rear")
            }
            onClick={() => control("rear")}
          >
            Câmera traseira
          </button>
        </div>
        {status.control && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              control("text", { text });
              setText("");
            }}
          >
            <label>
              Texto para um campo selecionado no tablet
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={256}
                disabled={!status.control}
              />
            </label>
            <button className="secondary" disabled={!status.control || !text}>
              Enviar texto
            </button>
          </form>
        )}
      </div>
    </>
  );
}
