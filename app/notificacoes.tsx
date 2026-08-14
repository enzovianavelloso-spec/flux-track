"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Som tipo caixa registradora ("cha-ching") via Web Audio — sem asset pra licenciar/enviar
// pra um som que toca poucas vezes por dia. Golpe metálico + moedas caindo em sequência,
// no padrão usado por Hotmart/Kiwify/Utmify pra alerta de venda.
function tocarSom() {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const tocarNota = (freq: number, inicio: number, duracao: number, tipo: OscillatorType, pico: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tipo;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime + inicio);
    gain.gain.linearRampToValueAtTime(pico, ctx.currentTime + inicio + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracao);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + inicio);
    osc.stop(ctx.currentTime + inicio + duracao);
  };
  // Impacto metálico ("cha")
  tocarNota(2400, 0, 0.1, "triangle", 0.2);
  tocarNota(3600, 0, 0.08, "triangle", 0.14);
  // Moedas caindo ("ching-ching-ching")
  [1800, 2200, 2600, 3000].forEach((freq, i) => {
    tocarNota(freq, 0.08 + i * 0.05, 0.09, "triangle", 0.18);
  });
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
      // Tag única por clique — mesma tag faz o navegador substituir a notificação anterior
      // em vez de empilhar, e o teste precisa provar que vendas seguidas empilham.
      reg.showNotification("Venda aprovada!", {
        body: "Valor: R$ 97,00",
        icon: "/icons/icon-192.png",
        tag: `flux-track-teste-${Date.now()}`,
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
