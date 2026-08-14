"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Short two-tone chime via Web Audio — no audio asset to source/license/ship for a sound
// that plays maybe a few times a day.
function tocarSom() {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const tocarNota = (freq: number, inicio: number, duracao: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime + inicio);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + inicio + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracao);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + inicio);
    osc.stop(ctx.currentTime + inicio + duracao);
  };
  tocarNota(880, 0, 0.18);
  tocarNota(1318.5, 0.12, 0.25);
}

type Estado = "indisponivel" | "negado" | "inativo" | "ativo" | "carregando";

export function Notificacoes({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [estado, setEstado] = useState<Estado>("carregando");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setEstado("indisponivel");
      return;
    }
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      if (Notification.permission === "denied") { setEstado("negado"); return; }
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub ? "ativo" : "inativo");
    });
  }, []);

  async function ativar() {
    setEstado("carregando");
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") { setEstado("negado"); return; }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    setEstado("ativo");
  }

  async function desativar() {
    setEstado("carregando");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    setEstado("inativo");
  }

  async function simular() {
    tocarSom();
    if (Notification.permission === "granted" && "serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification("Venda confirmada 🎉", {
        body: "Produto de teste — R$ 97,00",
        icon: "/icons/icon-192.png",
        tag: "flux-track-teste",
      });
    }
  }

  return (
    <div className="cartao" data-anima>
      <div className="metrica-rotulo">Notificações de venda</div>
      <div className="notificacoes-acoes">
        {estado === "ativo" && (
          <>
            <span className="selo selo-ok">Ativas neste aparelho</span>
            <button type="button" className="pill" onClick={desativar}>Desativar</button>
          </>
        )}
        {estado === "inativo" && (
          <button type="button" className="botao" onClick={ativar}>Ativar notificações</button>
        )}
        {estado === "negado" && (
          <span className="selo selo-erro">Bloqueadas no navegador — libere em Configurações do site</span>
        )}
        {estado === "indisponivel" && (
          <span className="selo selo-neutro">Não suportado neste navegador</span>
        )}
        {estado === "carregando" && <span className="selo selo-neutro">Verificando…</span>}
        <button type="button" className="pill" onClick={simular}>Simular venda</button>
      </div>
      <p className="metrica-nota">Toca o som e mostra a notificação como uma venda real dispararia.</p>
    </div>
  );
}
