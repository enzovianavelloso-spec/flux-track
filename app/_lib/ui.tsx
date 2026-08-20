/** Helpers e componentes compartilhados entre as páginas do painel (Painel, Diagnóstico,
 *  Anúncios) — extraídos quando o 3º consumidor apareceu (Anúncios), pra não duplicar
 *  formatação/filtro de período pela 3ª vez. */

export const dinheiro = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const porcento = (n: number) => (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
export const inteiro = (n: number) => n.toLocaleString("pt-BR");

export function dataIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** "2026-07-24" -> "24/07/2026". Sem `new Date()`: a string ISO pura seria lida como
 *  UTC e voltaria um dia atrás pra quem está em fuso negativo. */
export function dataBr(iso: string | undefined, alternativa: string) {
  if (!iso) return alternativa;
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/** Monta querystring preservando os filtros atuais + as chaves passadas em `sobrepor`. */
export function comFiltros(sp: Record<string, string | undefined>, sobrepor: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  const combinado = { ...sp, ...sobrepor };
  for (const [k, v] of Object.entries(combinado)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "/";
}

/** Pills Hoje/7 dias/30 dias + "Tudo" (via ?periodo=tudo) e o range efetivo quando nenhum
 *  filtro é passado na URL — default abre em "Hoje". Mesma lógica usada por Painel e Anúncios. */
export function calcularPeriodo(sp: Record<string, string | undefined>, hoje: Date) {
  const periodos = [
    { rotulo: "Hoje", dias: 0 },
    { rotulo: "7 dias", dias: 6 },
    { rotulo: "30 dias", dias: 29 },
  ].map((p) => {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - p.dias);
    const de = dataIso(inicio), ate = dataIso(hoje);
    return { ...p, de, ate, ativo: sp.from === de && sp.to === ate };
  });

  const tudo = sp.periodo === "tudo";
  const from = tudo ? undefined : (sp.from ?? periodos[0].de);
  const to = tudo ? undefined : (sp.to ?? periodos[0].ate);
  const semFiltroData = tudo;
  const filtroHojeImplicito = !tudo && !sp.from && !sp.to;

  return { periodos, tudo, from, to, semFiltroData, filtroHojeImplicito };
}

export function InfoIcone({ texto }: { texto: string }) {
  return (
    <span className="info-icone" tabIndex={0}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <text x="8" y="11.5" textAnchor="middle" fontSize="10" fill="currentColor">i</text>
      </svg>
      <span className="info-tooltip" role="tooltip">{texto}</span>
    </span>
  );
}

export function Metrica({
  rotulo, valorNum, valorTexto, formato, nota, cor, hero, tooltip,
}: {
  rotulo: string;
  valorNum: number | null;
  valorTexto: string;
  formato: "moeda" | "pct" | "roas";
  nota?: string;
  cor?: "positivo" | "negativo";
  hero?: boolean;
  tooltip?: string;
}) {
  return (
    <div className={`cartao cartao-metrica ${hero ? "cartao-hero" : ""}`} data-anima>
      <div className="metrica-rotulo">
        {rotulo}
        {tooltip && <InfoIcone texto={tooltip} />}
      </div>
      <div
        className={`${hero ? "metrica-valor-hero" : "metrica-valor"} num ${cor ?? ""}`}
        data-num-valor={valorNum === null ? undefined : valorNum}
        data-num-formato={formato}
      >
        {valorTexto}
      </div>
      {nota && <div className="metrica-nota">{nota}</div>}
    </div>
  );
}

export function Selo({ tipo, children }: { tipo: "ok" | "erro" | "espera" | "neutro"; children: React.ReactNode }) {
  return <span className={`selo selo-${tipo}`}>{children}</span>;
}
