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
  useEffect(() => {
    setFrame("");
    setError("");
    setStatus({ mode: "offline", control: false });
    if (!selected) return;
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/mobile/live?device=${selected}`,
    );
    ws.binaryType = "blob";
    connection.current = ws;
    ws.onmessage = (e) => {
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
            if (["offline", "stopped", "waiting"].includes(data.mode)) {
              setFrame("");
              if (imageUrl.current) {
                URL.revokeObjectURL(imageUrl.current);
                imageUrl.current = "";
              }
            }
          }
          if (data.type === "error") setError(data.message);
        } catch {}
      }
    };
    ws.onclose = () => {
      if (imageUrl.current) {
        URL.revokeObjectURL(imageUrl.current);
        imageUrl.current = "";
      }
      setStatus({ mode: "offline", control: false });
      setFrame("");
    };
    ws.onerror = () =>
      setError(
        "Não foi possível abrir a sessão. Verifique login e conexão do tablet.",
      );
    return () => {
      ws.close();
      connection.current = null;
      if (imageUrl.current) {
        URL.revokeObjectURL(imageUrl.current);
        imageUrl.current = "";
      }
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
            Versão 0.2.2 · Android 8 ou superior. Visualização de tela e
            câmeras, sem acessibilidade ou toques remotos. O app solicita
            permissões no tablet e permite encerrar a qualquer momento.
          </p>
        </div>
        <div className="panel">
          <h2>Iniciar a sessão</h2>
          <p>
            No tablet, escolha Tela ou Câmera e toque Iniciar sessão. As
            permissões necessárias são solicitadas em sequência. A captura de
            tela exige autorização do Android em cada sessão. Não há limite fixo
            de duração nem gravação.
          </p>
          <p className="muted">
            Se o Play Protect bloquear a instalação, não desative a proteção.
            Registre o aviso para revisão do APK. Câmera precisa ser iniciada no
            app. Telas de senha, bloqueio e permissões exigem ação local.
            Encerrar a visualização também encerra o compartilhamento no
            dispositivo.
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
            onChange={(e) => setSelected(e.target.value)}
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
              setSelected("");
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
            disabled={!selected}
            onClick={() => {
              control("stop");
              setSelected("");
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
          {[
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
            disabled={status.mode !== "camera"}
            onClick={() => control("front")}
          >
            Câmera frontal
          </button>
          <button
            className="secondary"
            disabled={status.mode !== "camera"}
            onClick={() => control("rear")}
          >
            Câmera traseira
          </button>
        </div>
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
      </div>
    </>
  );
}
