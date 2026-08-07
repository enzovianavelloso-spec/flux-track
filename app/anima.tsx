"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

type Formato = "moeda" | "inteiro" | "pct" | "roas" | "ms";

function formatar(v: number, formato: Formato): string {
  switch (formato) {
    case "moeda":
      return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    case "pct":
      return (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
    case "roas":
      return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "x";
    case "ms":
      return Math.round(v) + "ms";
    case "inteiro":
    default:
      return Math.round(v).toLocaleString("pt-BR");
  }
}

/**
 * Coreografia de entrada da página: cascata nos cartões (`[data-anima]`), cascata mais
 * curta nas linhas de tabela (`[data-anima-linha]`) e contagem dos números
 * (`[data-num-valor]` + `[data-num-formato]`). Server continua dono do dado — este
 * componente só lê o que já foi renderizado e anima por cima.
 *
 * O servidor já escreve o valor final formatado no HTML: sem JS, ou com
 * `prefers-reduced-motion`, o número certo já está lá — o count-up é purinho enfeite.
 */
export function Anima({ children }: { children: React.ReactNode }) {
  const escopo = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const raiz = escopo.current;
    if (!raiz) return;

    // useGSAP já cria um contexto próprio e reverte tudo dentro dele ao desmontar —
    // um gsap.matchMedia() manual por cima disso tinha revert duplo (o dele + o do hook)
    // matando os tweens com delay antes de rodarem. Checagem direta do media query, sem
    // instância própria, evita o conflito e ainda respeita prefers-reduced-motion.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cartoes = gsap.utils.toArray<HTMLElement>("[data-anima]", raiz);
    const linhas = gsap.utils.toArray<HTMLElement>("[data-anima-linha]", raiz);
    const numeros = gsap.utils.toArray<HTMLElement>("[data-num-valor]", raiz);

    const tl = gsap.timeline();
    if (cartoes.length) {
      tl.from(cartoes, { y: 16, opacity: 0, duration: 0.6, ease: "expo.out", stagger: 0.06 });
    }
    if (linhas.length) {
      tl.from(
        linhas,
        { y: 8, opacity: 0, duration: 0.4, ease: "power2.out", stagger: 0.03 },
        cartoes.length ? "-=0.35" : 0,
      );
    }

    // Traço do gráfico e barras do funil (CSS puro, ver globals.css) entram um instante
    // depois dos cartões pra não competir visualmente com a cascata deles.
    raiz.style.setProperty("--atraso-secundario", "380ms");

    numeros.forEach((el) => {
      const alvo = Number(el.dataset.numValor);
      const formato = (el.dataset.numFormato as Formato) || "inteiro";
      if (!Number.isFinite(alvo)) return;
      const estado = { v: 0 };
      el.textContent = formatar(0, formato); // some pra 0 antes de contar, sem flash do valor final
      gsap.to(estado, {
        v: alvo,
        duration: 0.9,
        delay: 0.2,
        ease: "power2.out",
        onUpdate: () => { el.textContent = formatar(estado.v, formato); },
      });
    });
  }, { scope: escopo });

  return <div ref={escopo}>{children}</div>;
}
