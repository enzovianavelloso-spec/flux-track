"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Som de caixa registradora real (mp3), não sintetizado — Web Audio nunca ficava
// idêntico à referência. Asset: "Cash Register (Kaching) - Sound Effect" por
// Modestas123123, Pixabay Content License (uso livre, inclusive comercial, sem
// atribuição obrigatória). https://pixabay.com/sound-effects/film-special-effects-cash-register-kaching-sound-effect-125042/
function tocarSom() {
  const audio = new Audio("/sons/caixa-registradora.mp3");
  audio.play().catch(() => {});
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
