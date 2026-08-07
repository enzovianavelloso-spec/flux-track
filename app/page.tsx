import Link from "next/link";
import { Cabecalho } from "./cabecalho";
import { Anima } from "./anima";
import { getDashboard, type DashboardFilters } from "@/lib/db/queries/dashboard";

const dinheiro = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const porcento = (n: number) => (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
const inteiro = (n: number) => n.toLocaleString("pt-BR");

function dataIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** "2026-07-24" -> "24/07/2026". Sem `new Date()`: a string ISO pura seria lida como
 *  UTC e voltaria um dia atrás pra quem está em fuso negativo. */
function dataBr(iso: string | undefined, alternativa: string) {
  if (!iso) return alternativa;
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/** Monta querystring preservando os filtros atuais + as chaves passadas em `sobrepor`. */
function comFiltros(sp: Record<string, string | undefined>, sobrepor: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  const combinado = { ...sp, ...sobrepor };
  for (const [k, v] of Object.entries(combinado)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "/";
}

function Metrica({
  rotulo, valorNum, valorTexto, formato, nota, cor, hero,
}: {
  rotulo: string;
  valorNum: number | null;
  valorTexto: string;
  formato: "moeda" | "pct" | "roas";
  nota?: string;
  cor?: "positivo" | "negativo";
  hero?: boolean;
}) {
  return (
    <div className={`cartao cartao-metrica ${hero ? "cartao-hero" : ""}`} data-anima>
      <div className="metrica-rotulo">{rotulo}</div>
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

/**
 * Receita por dia. SVG puro, renderizado no servidor — sem biblioteca de gráfico
 * pra uma série de até algumas dezenas de pontos. Cada ponto tem tooltip visível no
 * hover/foco e <title> nativo pra leitor de tela.
 */
function GraficoReceita({ dados }: { dados: { date: string; amount: number }[] }) {
  if (dados.length < 2) {
    return (
      <p className="sem-dado">
        Ainda não há vendas suficientes pra desenhar a curva. O gráfico aparece a partir de dois dias com venda.
      </p>
    );
  }

  const largura = 720, altura = 200;
  const margemEsq = 8, margemDir = 8, margemTopo = 20, margemBaixo = 26;
  const areaL = largura - margemEsq - margemDir;
  const areaA = altura - margemTopo - margemBaixo;

  const maximo = Math.max(...dados.map((d) => d.amount), 1);
  const passo = areaL / (dados.length - 1);
  const x = (i: number) => margemEsq + i * passo;
  const y = (v: number) => margemTopo + areaA - (v / maximo) * areaA;

  const pontos = dados.map((d, i) => `${x(i)},${y(d.amount)}`).join(" ");
  const areaPreenchida = `${margemEsq},${margemTopo + areaA} ${pontos} ${x(dados.length - 1)},${margemTopo + areaA}`;
  const comprimento = Math.round(dados.reduce((soma, d, i) => {
    if (i === 0) return 0;
    return soma + Math.hypot(passo, y(d.amount) - y(dados[i - 1].amount));
  }, 0));

  const diaCurto = (iso: string) => {
    const [, m, dd] = iso.split("-");
    return `${dd}/${m}`;
  };

  // No máximo 5 rótulos de eixo, distribuídos — 14+ datas coladas ficam ilegíveis.
  const passoRotulo = Math.max(1, Math.ceil(dados.length / 5));
  const indicesRotulo = dados.map((_, i) => i).filter((i) => i % passoRotulo === 0 || i === dados.length - 1);

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      className="grafico"
      role="img"
      aria-label={`Receita diária dos últimos ${dados.length} dias. Maior dia: ${dinheiro(maximo)}.`}
    >
      <defs>
        <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--positivo)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--positivo)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.5, 1].map((f) => (
        <line
          key={f}
          x1={margemEsq} x2={largura - margemDir}
          y1={margemTopo + areaA * f} y2={margemTopo + areaA * f}
          className="grafico-grade"
        />
      ))}
      <text x={margemEsq} y={margemTopo - 6} className="grafico-teto">{dinheiro(maximo)}</text>

      <polygon points={areaPreenchida} fill="url(#gradReceita)" />
      <polyline
        points={pontos}
        className="grafico-linha grafico-linha-anima"
        style={{ "--comprimento": comprimento, animationDelay: "var(--atraso-secundario, 0ms)" } as React.CSSProperties}
      />

      {dados.map((d, i) => {
        const px = x(i), py = y(d.amount);
        const tooltipEsq = px > largura - 90;
        const tx = tooltipEsq ? px - 96 : px + 8;
        return (
          <g key={d.date} className="grafico-ponto" tabIndex={0}>
            <circle cx={px} cy={py} r={11} fill="transparent" />
            <circle cx={px} cy={py} r={4} className="grafico-ponto-visivel" />
            <g className="grafico-tooltip" transform={`translate(${tx}, ${py - 34})`}>
              <rect width={88} height={26} rx={6} strokeWidth={1} />
              <text x={8} y={17}>{`${diaCurto(d.date)} · ${dinheiro(d.amount)}`}</text>
            </g>
            <title>{`${diaCurto(d.date)} — ${dinheiro(d.amount)}`}</title>
          </g>
        );
      })}

      {indicesRotulo.map((i) => (
        <text
          key={i}
          x={x(i)} y={altura - 8}
          textAnchor={i === 0 ? "start" : i === dados.length - 1 ? "end" : "middle"}
          className="grafico-eixo"
        >
          {diaCurto(dados[i].date)}
        </text>
      ))}
    </svg>
  );
}

function Funil({ funil }: { funil: { clicks: number; generated: number; paid: number } }) {
  const base = Math.max(funil.clicks, 1);
  const etapas = [
    { nome: "Cliques", valor: funil.clicks, cor: "var(--marca)" },
    { nome: "Checkouts", valor: funil.generated, cor: "var(--atencao)" },
    { nome: "Vendas pagas", valor: funil.paid, cor: "var(--positivo)" },
  ];

  return (
    <div>
      {etapas.map((e, i) => (
        <div className="funil-linha" key={e.nome}>
          <span className="funil-nome">{e.nome}</span>
          <div className="funil-trilho">
            <div
              className="funil-barra"
              style={{
                width: `${Math.max((e.valor / base) * 100, e.valor > 0 ? 2 : 0)}%`,
                background: e.cor,
                animationDelay: `calc(var(--atraso-secundario, 0ms) + ${i * 90}ms)`,
              }}
            />
          </div>
          <span className="funil-valor num">{inteiro(e.valor)}</span>
          <span className="funil-pct num">{i > 0 ? porcento(e.valor / base) : ""}</span>
        </div>
      ))}
    </div>
  );
}

export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filtros: DashboardFilters = {
    from: sp.from, to: sp.to,
    campaign: sp.campaign, platform: sp.platform, productId: sp.productId,
  };
  const d = await getDashboard(filtros);

  const hoje = new Date();
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

  const semFiltroData = !sp.from && !sp.to;

  return (
    <>
      <Cabecalho atual="painel" />

      <Anima>
        <main className="pagina">
          <div className="cabecalho">
            <h1 className="titulo">Painel</h1>
            <p className="subtitulo">
              {semFiltroData
                ? "Todo o período registrado"
                : `De ${dataBr(sp.from, "o início")} até ${dataBr(sp.to, "hoje")}`}
            </p>
          </div>

          <div className="filtros">
            {periodos.map((p) => (
              <Link
                key={p.rotulo}
                href={comFiltros(sp, { from: p.de, to: p.ate })}
                className="pill"
                aria-current={p.ativo ? "true" : undefined}
              >
                {p.rotulo}
              </Link>
            ))}
            <Link href={comFiltros(sp, { from: undefined, to: undefined })} className="pill" aria-current={semFiltroData ? "true" : undefined}>
              Tudo
            </Link>
          </div>

          <form method="get" className="filtros" style={{ marginBottom: "var(--e5)" }}>
            <input type="date" name="from" defaultValue={sp.from} className="campo" aria-label="Data inicial" />
            <input type="date" name="to" defaultValue={sp.to} className="campo" aria-label="Data final" />
            <select name="campaign" defaultValue={sp.campaign ?? ""} className="campo" aria-label="Campanha">
              <option value="">Toda campanha</option>
              {d.filterOptions.campaigns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select name="platform" defaultValue={sp.platform ?? ""} className="campo" aria-label="Plataforma">
              <option value="">Toda plataforma</option>
              {d.filterOptions.platforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select name="productId" defaultValue={sp.productId ?? ""} className="campo" aria-label="Produto">
              <option value="">Todo produto</option>
              {d.filterOptions.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="submit" className="botao">Aplicar</button>
          </form>

          <div className="rotulo-seccao">Resultado</div>
          <div className="grade grade-4">
            <Metrica
              hero
              rotulo="Lucro"
              valorNum={d.profit}
              valorTexto={dinheiro(d.profit)}
              formato="moeda"
              nota="Faturamento menos investimento em anúncios"
              cor={d.profit >= 0 ? "positivo" : "negativo"}
            />
            <Metrica rotulo="Faturamento" valorNum={d.netRevenue} valorTexto={dinheiro(d.netRevenue)} formato="moeda" nota="Soma das vendas pagas" />
            <Metrica rotulo="Investido em anúncios" valorNum={d.adSpend} valorTexto={dinheiro(d.adSpend)} formato="moeda" nota="Gasto na Meta" />
            <Metrica
              rotulo="Retorno (ROAS)"
              valorNum={d.roas}
              valorTexto={d.roas === null ? "—" : d.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "x"}
              formato="roas"
              nota="Reais faturados por real investido"
            />
          </div>

          <div className="rotulo-seccao" style={{ marginTop: "var(--e5)" }}>Eficiência</div>
          <div className="grade grade-3">
            <Metrica rotulo="Ganho por clique" valorNum={d.epc} valorTexto={d.epc === null ? "—" : dinheiro(d.epc)} formato="moeda" nota="Quanto cada clique rendeu" />
            <Metrica rotulo="Custo por venda" valorNum={d.cpa} valorTexto={d.cpa === null ? "—" : dinheiro(d.cpa)} formato="moeda" nota="Quanto custou cada venda paga" />
            <Metrica
              rotulo="Taxa de conversão"
              valorNum={d.conversionRate}
              valorTexto={d.conversionRate === null ? "—" : porcento(d.conversionRate)}
              formato="pct"
              nota="Cliques que viraram venda"
            />
          </div>

          <div className="cartao" data-anima style={{ marginTop: "var(--e5)" }}>
            <div className="metrica-rotulo">Receita por dia{semFiltroData ? " — últimos 14 dias" : ""}</div>
            <GraficoReceita dados={d.dailyRevenue} />
          </div>

          <div className="cartao" data-anima style={{ marginTop: "var(--e3)" }}>
            <div className="metrica-rotulo">Do clique à venda</div>
            <Funil funil={d.funnel} />
          </div>
        </main>
      </Anima>
    </>
  );
}
