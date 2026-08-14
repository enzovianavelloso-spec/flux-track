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

function InfoIcone({ texto }: { texto: string }) {
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

function Metrica({
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

const CORES_METODO: Record<string, string> = {
  pix: "var(--positivo)",
  card: "var(--marca)",
  cartao: "var(--marca)",
  boleto: "var(--atencao)",
};

function rotuloMetodo(metodo: string) {
  const mapa: Record<string, string> = { pix: "Pix", card: "Cartão", cartao: "Cartão", boleto: "Boleto", outros: "Outros" };
  return mapa[metodo] ?? metodo.charAt(0).toUpperCase() + metodo.slice(1);
}

/** Vendas por método de pagamento. Anel SVG à mão, mesma técnica de stroke-dasharray
 *  do gráfico de linha, uma fatia por método. */
function GraficoPagamento({ dados }: { dados: { method: string; count: number; revenue: number }[] }) {
  const total = dados.reduce((n, d) => n + d.count, 0);
  if (total === 0) {
    return <p className="sem-dado">Nenhuma venda por aqui.</p>;
  }

  const raio = 70, cx = 90, cy = 90;
  const circunferencia = 2 * Math.PI * raio;
  let acumulado = 0;

  return (
    <div className="grafico-donut-wrap">
      <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label={`Vendas por método de pagamento, total ${total}`}>
        <circle cx={cx} cy={cy} r={raio} fill="none" stroke="var(--suave)" strokeWidth="20" />
        {dados.map((d) => {
          const fracao = d.count / total;
          const comprimentoFatia = fracao * circunferencia;
          const offset = circunferencia - acumulado;
          acumulado += comprimentoFatia;
          const cor = CORES_METODO[d.method] ?? "var(--texto-fraco)";
          return (
            <circle
              key={d.method}
              cx={cx} cy={cy} r={raio} fill="none" stroke={cor} strokeWidth="20"
              strokeDasharray={`${comprimentoFatia} ${circunferencia - comprimentoFatia}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              className="donut-fatia"
              style={{ "--comprimento": Math.round(comprimentoFatia) } as React.CSSProperties}
            >
              <title>{`${rotuloMetodo(d.method)}: ${inteiro(d.count)} (${porcento(fracao)})`}</title>
            </circle>
          );
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="donut-total-num">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="donut-total-rotulo">Total</text>
      </svg>
      <ul className="donut-legenda">
        {dados.map((d) => (
          <li key={d.method}>
            <span className="donut-ponto" style={{ background: CORES_METODO[d.method] ?? "var(--texto-fraco)" }} />
            {rotuloMetodo(d.method)} — {inteiro(d.count)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Taxa de aprovação por método — aro único, reusado 3x (Cartão/Pix/Boleto). */
function Aro({ rotulo, rate }: { rotulo: string; rate: number | null }) {
  const raio = 44, circunferencia = 2 * Math.PI * raio;
  const fracao = rate ?? 0;
  const offsetFinal = circunferencia * (1 - fracao);
  return (
    <div className="aro-item">
      <svg viewBox="0 0 100 100" width="100" height="100">
        <circle cx="50" cy="50" r={raio} fill="none" stroke="var(--suave)" strokeWidth="10" />
        {rate !== null && (
          <circle
            cx="50" cy="50" r={raio} fill="none" stroke="var(--marca)" strokeWidth="10"
            strokeLinecap="round" transform="rotate(-90 50 50)"
            className="aro-anima"
            style={{ "--comprimento": circunferencia, "--offset-final": offsetFinal } as React.CSSProperties}
          />
        )}
        <text x="50" y="55" textAnchor="middle" className="aro-valor">{rate === null ? "N/A" : porcento(rate)}</text>
      </svg>
      <div className="aro-rotulo">{rotulo}</div>
    </div>
  );
}

function ListaRanking({ itens, vazio }: { itens: { rotulo: string; count: number; revenue: number }[]; vazio: string }) {
  if (itens.length === 0) {
    return <p className="sem-dado">{vazio}</p>;
  }
  return (
    <ul className="lista-ranking">
      {itens.map((it, i) => (
        <li
          key={it.rotulo}
          data-anima-linha
          style={{ animationDelay: `calc(var(--atraso-secundario, 0ms) + ${i * 40}ms)` }}
        >
          <span className="lista-ranking-nome">{it.rotulo}</span>
          <span className="lista-ranking-valor num">{dinheiro(it.revenue)}</span>
          <span className="lista-ranking-conta num">{inteiro(it.count)} vendas</span>
        </li>
      ))}
    </ul>
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

          {d.adSpendCaveat && (
            <p className="metrica-nota" style={{ marginTop: "var(--e2)" }}>
              Gasto não pode ser segmentado por plataforma/produto — mostrando total do período nos cartões de investimento, ROAS, lucro, ROI e margem.
            </p>
          )}

          <div className="rotulo-seccao" style={{ marginTop: "var(--e5)" }}>Pagamentos</div>
          <div className="grade grade-pagamentos">
            <div className="cartao cartao-donut" data-anima style={{ gridColumn: "span 2", gridRow: "span 2" }}>
              <div className="metrica-rotulo">
                Vendas por Pagamento
                <InfoIcone texto="Distribuição das vendas pagas por método de pagamento" />
              </div>
              <GraficoPagamento dados={d.paymentBreakdown} />
            </div>
            <Metrica rotulo="Vendas Pendentes" valorNum={d.pendingRevenue} valorTexto={dinheiro(d.pendingRevenue)} formato="moeda" tooltip="Soma de vendas com status pendente" />
            <Metrica
              rotulo="ROI"
              valorNum={d.roi}
              valorTexto={d.roi === null ? "—" : porcento(d.roi)}
              formato="pct"
              tooltip="Lucro dividido pelo investimento em anúncios"
            />
            <Metrica rotulo="Vendas Reembolsadas" valorNum={d.refundedRevenue} valorTexto={dinheiro(d.refundedRevenue)} formato="moeda" tooltip="Soma de vendas reembolsadas" />
            <Metrica
              rotulo="Margem"
              valorNum={d.margin}
              valorTexto={d.margin === null ? "—" : porcento(d.margin)}
              formato="pct"
              tooltip="Lucro dividido pelo faturamento"
            />
          </div>

          <div className="grade grade-3" style={{ marginTop: "var(--e3)" }}>
            <Metrica
              rotulo="Chargeback"
              valorNum={d.chargebackRate}
              valorTexto={d.chargebackRate === null ? "—" : porcento(d.chargebackRate)}
              formato="pct"
              tooltip="Vendas contestadas sobre o total de vendas do período"
            />
          </div>

          <div className="rotulo-seccao" style={{ marginTop: "var(--e5)" }}>Detalhamento</div>
          <div className="grade grade-3">
            <div className="cartao" data-anima>
              <div className="metrica-rotulo">
                Vendas por Produto
                <InfoIcone texto="Faturamento pago agrupado por produto" />
              </div>
              <ListaRanking
                vazio="Nenhuma venda por aqui."
                itens={d.productBreakdown.map((p) => ({ rotulo: p.name, count: p.count, revenue: p.revenue }))}
              />
            </div>
            <div className="cartao" data-anima>
              <div className="metrica-rotulo">
                Vendas por Fonte
                <InfoIcone texto="Faturamento pago agrupado pela plataforma de origem do clique" />
              </div>
              <ListaRanking
                vazio="Nenhuma venda por aqui."
                itens={d.sourceBreakdown.map((s) => ({ rotulo: rotuloMetodo(s.platform), count: s.count, revenue: s.revenue }))}
              />
            </div>
            <div className="cartao" data-anima>
              <div className="metrica-rotulo">
                Taxa de Aprovação
                <InfoIcone texto="Vendas aprovadas sobre aprovadas mais recusadas, por método" />
              </div>
              <div className="aro-grade">
                {["card", "pix", "boleto"].map((metodo) => {
                  const linha = d.approvalRates.find((a) => a.method === metodo);
                  return <Aro key={metodo} rotulo={rotuloMetodo(metodo)} rate={linha?.rate ?? null} />;
                })}
              </div>
            </div>
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
