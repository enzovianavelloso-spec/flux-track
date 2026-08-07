import Link from "next/link";
import { Cabecalho } from "./cabecalho";
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

/** Cartão de número. `nota` explica a sigla em português, pra não depender de jargão. */
function Metrica({
  rotulo, valor, nota, cor, ordem,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  cor?: "positivo" | "negativo";
  ordem: number;
}) {
  return (
    <div className="cartao cartao-metrica entra" style={{ "--i": ordem } as React.CSSProperties}>
      <div className="metrica-rotulo">{rotulo}</div>
      <div className={`metrica-valor num ${cor ?? ""}`}>{valor}</div>
      {nota && <div className="metrica-nota">{nota}</div>}
    </div>
  );
}

/**
 * Receita por dia. SVG puro, renderizado no servidor — sem biblioteca de gráfico
 * pra uma série única de 14 pontos. Cada ponto tem <title>, então o valor exato
 * aparece no hover do mouse e é lido por leitor de tela.
 */
function GraficoReceita({ dados }: { dados: { date: string; amount: number }[] }) {
  if (dados.length < 2) {
    return (
      <p className="sem-dado">
        Ainda não há vendas suficientes pra desenhar a curva. O gráfico aparece a partir de dois dias com venda.
      </p>
    );
  }

  const largura = 720, altura = 180;
  const margemEsq = 8, margemDir = 8, margemTopo = 12, margemBaixo = 26;
  const areaL = largura - margemEsq - margemDir;
  const areaA = altura - margemTopo - margemBaixo;

  const maximo = Math.max(...dados.map((d) => d.amount), 1);
  const passo = areaL / (dados.length - 1);
  const x = (i: number) => margemEsq + i * passo;
  const y = (v: number) => margemTopo + areaA - (v / maximo) * areaA;

  const pontos = dados.map((d, i) => `${x(i)},${y(d.amount)}`).join(" ");
  const areaPreenchida = `${margemEsq},${margemTopo + areaA} ${pontos} ${x(dados.length - 1)},${margemTopo + areaA}`;
  // Aproxima o comprimento da linha pra animar o traço "sendo desenhado".
  const comprimento = Math.round(dados.reduce((soma, d, i) => {
    if (i === 0) return 0;
    return soma + Math.hypot(passo, y(d.amount) - y(dados[i - 1].amount));
  }, 0));

  const diaCurto = (iso: string) => {
    const [, m, dd] = iso.split("-");
    return `${dd}/${m}`;
  };

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      className="grafico"
      role="img"
      aria-label={`Receita diária dos últimos ${dados.length} dias. Maior dia: ${dinheiro(maximo)}.`}
    >
      <defs>
        <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--positivo)" stopOpacity="0.28" />
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

      <polygon points={areaPreenchida} fill="url(#gradReceita)" />
      <polyline
        points={pontos}
        className="grafico-linha grafico-linha-anima"
        style={{ "--comprimento": comprimento } as React.CSSProperties}
      />

      {dados.map((d, i) => (
        <circle key={d.date} cx={x(i)} cy={y(d.amount)} r={9} fill="transparent">
          <title>{`${diaCurto(d.date)} — ${dinheiro(d.amount)}`}</title>
        </circle>
      ))}

      {/* Só primeiro, meio e último rótulo: 14 datas lado a lado ficam ilegíveis no celular. */}
      {[0, Math.floor((dados.length - 1) / 2), dados.length - 1].map((i) => (
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
    { nome: "Cliques", valor: funil.clicks, cor: "var(--dado)" },
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
                animationDelay: `${i * 90}ms`,
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
    from: sp.from, to: sp.to, adAccountId: sp.adAccountId,
    trafficSource: sp.trafficSource, platform: sp.platform, productId: sp.productId,
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
            <a
              key={p.rotulo}
              href={`?from=${p.de}&to=${p.ate}`}
              className="pill"
              aria-current={p.ativo ? "true" : undefined}
            >
              {p.rotulo}
            </a>
          ))}
          <Link href="/" className="pill" aria-current={semFiltroData ? "true" : undefined}>
            Tudo
          </Link>
        </div>

        <form method="get" className="filtros" style={{ marginBottom: "var(--e5)" }}>
          <input type="date" name="from" defaultValue={sp.from} className="campo" aria-label="Data inicial" />
          <input type="date" name="to" defaultValue={sp.to} className="campo" aria-label="Data final" />
          <select name="trafficSource" defaultValue={sp.trafficSource ?? ""} className="campo" aria-label="Origem do tráfego">
            <option value="">Toda origem</option>
            {d.filterOptions.trafficSources.map((s) => <option key={s} value={s}>{s}</option>)}
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
          <Metrica ordem={0} rotulo="Faturamento" valor={dinheiro(d.netRevenue)} nota="Soma das vendas pagas" />
          <Metrica ordem={1} rotulo="Investido em anúncios" valor={dinheiro(d.adSpend)} nota="Gasto na Meta" />
          <Metrica
            ordem={2}
            rotulo="Lucro"
            valor={dinheiro(d.profit)}
            nota="Faturamento menos investimento"
            cor={d.profit >= 0 ? "positivo" : "negativo"}
          />
          <Metrica
            ordem={3}
            rotulo="Retorno (ROAS)"
            valor={d.roas === null ? "—" : d.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "x"}
            nota="Reais faturados por real investido"
          />
        </div>

        <div className="rotulo-seccao" style={{ marginTop: "var(--e5)" }}>Eficiência</div>
        <div className="grade grade-3">
          <Metrica ordem={4} rotulo="Ganho por clique" valor={d.epc === null ? "—" : dinheiro(d.epc)} nota="Quanto cada clique rendeu" />
          <Metrica ordem={5} rotulo="Custo por venda" valor={d.cpa === null ? "—" : dinheiro(d.cpa)} nota="Quanto custou cada venda paga" />
          <Metrica
            ordem={6}
            rotulo="Taxa de conversão"
            valor={d.conversionRate === null ? "—" : porcento(d.conversionRate)}
            nota="Cliques que viraram venda"
          />
        </div>

        <div className="cartao entra" style={{ "--i": 7, marginTop: "var(--e5)" } as React.CSSProperties}>
          <div className="metrica-rotulo">Receita por dia — últimos 14 dias</div>
          <GraficoReceita dados={d.dailyRevenue} />
        </div>

        <div className="cartao entra" style={{ "--i": 8, marginTop: "var(--e3)" } as React.CSSProperties}>
          <div className="metrica-rotulo">Do clique à venda</div>
          <Funil funil={d.funnel} />
        </div>
      </main>
    </>
  );
}
