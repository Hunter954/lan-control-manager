"use client";
import { useEffect, useState } from "react";

export default function ApkDownload() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => {
        if (!active) return;
        if (r.status === 401) {
          location.replace("/?download=apk");
          return;
        }
        if (!r.ok) throw new Error("Não foi possível verificar o login.");
        setReady(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function download() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/mobile/apk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (r.status === 401) {
        location.replace("/?download=apk");
        return;
      }
      if (!r.ok) throw new Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "LANControl-Android.apk";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <div className="brand">
        LC<span>LAN CONTROL</span>
      </div>
      <div className="loginbox">
        <h1>Baixar APK Android</h1>
        <p>
          Instalador personalizado, pronto para parear um dispositivo
          autorizado. O convite vale por 48 horas.
        </p>
        <button disabled={!ready || busy} onClick={download}>
          {busy
            ? "Preparando e assinando APK…"
            : ready
              ? "Baixar APK"
              : "Verificando login…"}
        </button>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <p className="muted">
          Abra o app para autorizar tela e câmeras. O download não concede essas
          permissões.
        </p>
        <a href="/">Voltar ao painel</a>
      </div>
    </main>
  );
}
